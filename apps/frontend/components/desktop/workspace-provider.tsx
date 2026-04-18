'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { platform, type WorkspaceInfo } from '@/lib/platform';
import { WorkspacePicker } from './workspace-picker';

interface WorkspaceContextValue {
  /** Current workspace path (null if not selected or on web) */
  workspacePath: string | null;
  /** Workspace metadata */
  workspaceInfo: WorkspaceInfo | null;
  /** Whether workspace check is still loading */
  isLoading: boolean;
  /** Change the workspace (opens picker on desktop) */
  changeWorkspace: () => Promise<void>;
  /** Re-fetch workspace file/folder counts (e.g. after agent creates files) */
  refreshWorkspaceInfo: () => Promise<void>;
  /** Whether we're on desktop */
  isDesktop: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspacePath: null,
  workspaceInfo: null,
  isLoading: true,
  changeWorkspace: async () => {},
  refreshWorkspaceInfo: async () => {},
  isDesktop: false,
});

export const useWorkspace = () => useContext(WorkspaceContext);

interface WorkspaceProviderProps {
  children: ReactNode;
}

export const WorkspaceProvider = ({ children }: WorkspaceProviderProps) => {
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [workspaceInfo, setWorkspaceInfo] = useState<WorkspaceInfo | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const init = async () => {
      const desktop = platform.isDesktop;
      setIsDesktop(desktop);

      if (desktop) {
        const path = await platform.getWorkspacePath();
        setWorkspacePath(path);
        if (path) {
          const info = await platform.getWorkspaceInfo();
          setWorkspaceInfo(info);
        }
      }
      setIsLoading(false);
    };

    init();
  }, []);

  const refreshWorkspaceInfo = useCallback(async () => {
    if (!platform.isDesktop) return;
    const info = await platform.getWorkspaceInfo();
    setWorkspaceInfo(info);
  }, []);

  const changeWorkspace = useCallback(async () => {
    const selected = await platform.selectWorkspaceFolder();
    if (selected) {
      setWorkspacePath(selected);
      await refreshWorkspaceInfo();
    }
  }, [refreshWorkspaceInfo]);

  const handleWorkspaceSelected = useCallback(
    async (path: string) => {
      setWorkspacePath(path);
      await refreshWorkspaceInfo();
    },
    [refreshWorkspaceInfo]
  );

  if (!isDesktop) {
    return (
      <WorkspaceContext.Provider
        value={{
          workspacePath: null,
          workspaceInfo: null,
          isLoading: false,
          changeWorkspace,
          refreshWorkspaceInfo,
          isDesktop: false,
        }}
      >
        {children}
      </WorkspaceContext.Provider>
    );
  }

  // Still checking
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Desktop but no workspace selected — show picker
  if (!workspacePath) {
    return <WorkspacePicker onWorkspaceSelected={handleWorkspaceSelected} />;
  }

  return (
    <WorkspaceContext.Provider
      value={{
        workspacePath,
        workspaceInfo,
        isLoading: false,
        changeWorkspace,
        refreshWorkspaceInfo,
        isDesktop,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};
