'use client';

import { useState, useEffect, useCallback } from 'react';
import { platform } from '@/lib/platform';
import type { GitContext } from '@/types/chat';

const STORAGE_KEY = 'portfolio-helper-git-context';

function loadCached(): GitContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GitContext) : null;
  } catch {
    return null;
  }
}

function saveCache(ctx: GitContext | null) {
  if (typeof window === 'undefined') return;
  if (ctx) {
    // Never persist the access token to the browser
    const { ...safe } = ctx as GitContext & { access_token?: string };
    delete (safe as Record<string, unknown>).access_token;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export interface GitContextState {
  context: GitContext | null;
  isDetected: boolean;
  setContext: (ctx: GitContext | null) => void;
}

/**
 * Platform-aware git context hook.
 *
 * Desktop: auto-detects the local git repo from the workspace on mount.
 *          Context type = 'local'. Persisted per-workspace.
 *
 * Web:     loads last-used context from localStorage on mount so new chats
 *          automatically carry the same repo/branch. Updated when the user
 *          clicks "Set as active" in the GitHub panel.
 */
export function useGitContext(workspacePath?: string | null): GitContextState {
  const [context, setContextState] = useState<GitContext | null>(() => {
    // Web: start from cache immediately (avoids flash of "no context")
    if (!platform.isDesktop) return loadCached();
    return null;
  });
  const [isDetected, setIsDetected] = useState(false);

  const setContext = useCallback((ctx: GitContext | null) => {
    setContextState(ctx);
    // Persist for both web (explicit selection) and desktop (branch override)
    saveCache(ctx);
  }, []);

  useEffect(() => {
    if (!platform.isDesktop) return;
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!api?.detectGit) return;

    api
      .detectGit()
      .then((info) => {
        // Use first repo if the root isn't git (multi-repo workspace)
        const primary = info.isGit ? info : (info.repos?.[0] ?? null);
        if (primary?.isGit && primary.branch) {
          const ctx: GitContext = {
            type: 'local',
            repoName: primary.repoName,
            branch: primary.branch,
            remote: primary.remote,
            workspacePath: primary.workspacePath,
          };
          setContextState(ctx);
          saveCache(ctx);
          setIsDetected(true);
        } else {
          setContextState(null);
          saveCache(null);
          setIsDetected(false);
        }
      })
      .catch(() => {
        setContextState(null);
      });
    // Re-run when the workspace changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacePath]);

  return { context, isDetected, setContext };
}
