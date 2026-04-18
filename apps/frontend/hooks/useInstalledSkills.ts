'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SkillConfig, SkillPlatform } from '@/types/electron';
import { skillsService } from '@/services/skills.service';

const QUERY_KEY = ['skills', 'user'];

const toSkillConfig = (s: {
  id: string;
  name: string;
  description: string;
  content: string;
  files?: Record<string, string> | null;
  enabled: boolean;
  platform?: string;
}): SkillConfig => ({
  id: s.id,
  name: s.name,
  description: s.description ?? '',
  content: s.content,
  files: s.files ?? undefined,
  enabled: s.enabled,
  platform: (s.platform as SkillPlatform) ?? 'both',
});

// ── Desktop hook (Electron IPC + optional backend sync) ────────────────

const useDesktopSkills = (enabled: boolean) => {
  const [skills, setSkills] = useState<SkillConfig[]>([]);
  const [skillsDir, setSkillsDir] = useState('');

  useEffect(() => {
    if (!enabled) return;
    const api = window.electronAPI;
    if (!api) return;
    (async () => {
      const [list, paths] = await Promise.all([
        api.getSkills(),
        api.getExtensionsPaths(),
      ]);

      // Merge backend skills (platform 'both' or 'web') with local list
      try {
        const backendSkills = await skillsService.getUserSkills();
        const backendMap = new Map(backendSkills.map((s) => [s.name, s]));
        const localNames = new Set(list.map((s) => s.name));

        // Pull web-only skills from backend that aren't local
        const webOnly = backendSkills
          .filter((s) => s.platform === 'web' && !localNames.has(s.name))
          .map(toSkillConfig);

        setSkills([
          ...list.map((s) => ({
            ...s,
            platform: s.platform ?? ('both' as SkillPlatform),
          })),
          ...webOnly,
        ]);

        // Push local 'both' skills that aren't in backend yet
        for (const skill of list) {
          if (
            (skill.platform ?? 'both') !== 'desktop' &&
            !backendMap.has(skill.name)
          ) {
            await skillsService.saveUserSkill({
              id: skill.id,
              name: skill.name,
              description: skill.description,
              content: skill.content,
              files: skill.files ?? null,
              enabled: skill.enabled,
              platform: skill.platform ?? 'both',
            });
          }
        }
      } catch {
        setSkills(
          list.map((s) => ({
            ...s,
            platform: s.platform ?? ('both' as SkillPlatform),
          }))
        );
      }

      setSkillsDir(paths.skillsDir);
    })();
  }, [enabled]);

  const reload = async () => {
    const api = window.electronAPI;
    if (!api) return;
    const [list, paths] = await Promise.all([
      api.getSkills(),
      api.getExtensionsPaths(),
    ]);
    setSkills(
      list.map((s) => ({
        ...s,
        platform: s.platform ?? ('both' as SkillPlatform),
      }))
    );
    setSkillsDir(paths.skillsDir);
  };

  const saveSkill = async (skill: SkillConfig) => {
    const api = window.electronAPI;
    if (!api) return;

    if (skill.platform !== 'desktop') {
      // Sync to backend for 'both' and 'web' skills
      try {
        await skillsService.saveUserSkill({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          content: skill.content,
          files: skill.files ?? null,
          enabled: skill.enabled,
          platform: skill.platform ?? 'both',
        });
      } catch {
        // Non-fatal — local save still proceeds
      }
    }

    if (skill.platform !== 'web') {
      await api.saveSkill(skill);
    }

    await reload();
  };

  const toggleSkill = async (id: string) => {
    const api = window.electronAPI;
    if (!api) return;
    const skill = skills.find((s) => s.id === id);
    if (!skill) return;
    const updated = { ...skill, enabled: !skill.enabled };

    if (updated.platform !== 'desktop') {
      try {
        await skillsService.updateUserSkill(id, { enabled: updated.enabled });
      } catch {
        // Non-fatal
      }
    }

    if (updated.platform !== 'web') {
      await api.saveSkill(updated);
    }

    setSkills((prev) => prev.map((s) => (s.id === id ? updated : s)));
  };

  const deleteSkill = async (id: string) => {
    const api = window.electronAPI;
    if (!api) return;
    const skill = skills.find((s) => s.id === id);

    if (skill && skill.platform !== 'desktop') {
      try {
        await skillsService.deleteUserSkill(id);
      } catch {
        // Non-fatal
      }
    }

    if (skill && skill.platform !== 'web') {
      await api.deleteSkill(id);
    }

    setSkills((prev) => prev.filter((s) => s.id !== id));
  };

  return { skills, skillsDir, saveSkill, toggleSkill, deleteSkill };
};

// ── Web hook (TanStack Query + backend API) ────────────────────────────

const useWebSkills = (enabled: boolean) => {
  const queryClient = useQueryClient();

  const { data: skills = [] } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const list = await skillsService.getUserSkills();
      return list.map(toSkillConfig);
    },
    enabled,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const { mutateAsync: saveMutation } = useMutation({
    mutationFn: (skill: SkillConfig) =>
      skillsService.saveUserSkill({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        content: skill.content,
        files: skill.files ?? null,
        enabled: skill.enabled,
        platform: skill.platform ?? 'both',
      }),
    onSuccess: invalidate,
  });

  const { mutateAsync: updateMutation } = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { enabled: boolean } }) =>
      skillsService.updateUserSkill(id, patch),
    onSuccess: invalidate,
  });

  const { mutateAsync: deleteMutation } = useMutation({
    mutationFn: (id: string) => skillsService.deleteUserSkill(id),
    onSuccess: invalidate,
  });

  const saveSkill = async (skill: SkillConfig) => {
    await saveMutation(skill);
  };

  const toggleSkill = async (id: string) => {
    const skill = skills.find((s) => s.id === id);
    if (!skill) return;
    await updateMutation({ id, patch: { enabled: !skill.enabled } });
  };

  const deleteSkill = async (id: string) => {
    await deleteMutation(id);
  };

  return { skills, skillsDir: '', saveSkill, toggleSkill, deleteSkill };
};

// ── Public hook — picks the right branch at runtime ───────────────────

export type InstalledSkillsHook = {
  skills: SkillConfig[];
  skillsDir: string;
  saveSkill: (skill: SkillConfig) => Promise<void>;
  toggleSkill: (id: string) => Promise<void>;
  deleteSkill: (id: string) => Promise<void>;
};

export const useInstalledSkills = (): InstalledSkillsHook => {
  const isDesktop = typeof window !== 'undefined' && !!window.electronAPI;

  // Both hooks are always called (Rules of Hooks), but each is gated by its
  // `enabled` flag so only the active branch does real work.
  const desktop = useDesktopSkills(isDesktop);
  const web = useWebSkills(!isDesktop);

  return isDesktop ? desktop : web;
};
