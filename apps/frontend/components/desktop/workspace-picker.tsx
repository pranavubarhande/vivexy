'use client';

import { useState, useEffect, useCallback } from 'react';
import { platform } from '@/lib/platform';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/common';
import {
  FolderOpen,
  Clock,
  FolderPlus,
  ArrowRight,
  Folder,
  FileText,
} from 'lucide-react';

interface WorkspacePickerProps {
  onWorkspaceSelected: (path: string) => void;
}

export const WorkspacePicker = ({
  onWorkspaceSelected,
}: WorkspacePickerProps) => {
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    platform.getRecentWorkspaces().then(setRecentWorkspaces);
  }, []);

  const handleSelectFolder = useCallback(async () => {
    setIsLoading(true);
    try {
      const selected = await platform.selectWorkspaceFolder();
      if (selected) {
        onWorkspaceSelected(selected);
      }
    } finally {
      setIsLoading(false);
    }
  }, [onWorkspaceSelected]);

  const handleSelectRecent = useCallback(
    async (workspacePath: string) => {
      setIsLoading(true);
      try {
        const result = await platform.setWorkspace(workspacePath);
        if (result.success) {
          onWorkspaceSelected(workspacePath);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [onWorkspaceSelected]
  );

  const extractName = (p: string) => {
    const parts = p.split(/[/\\]/);
    return parts[parts.length - 1] || p;
  };

  const shortenPath = (p: string) => {
    if (p.length <= 50) return p;
    const parts = p.split(/[/\\]/);
    if (parts.length <= 3) return p;
    return parts[0] + '/…/' + parts.slice(-2).join('/');
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-6">
      <div className="w-full max-w-lg space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-2">
            <FolderOpen className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Select a project folder
          </h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Choose a folder to use as your workspace. All files and artifacts
            will be saved here. The agent will only access files within this
            folder.
          </p>
        </div>

        {/* Main action */}
        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={handleSelectFolder}
            disabled={isLoading}
            className="gap-2 px-8 h-12 text-base rounded-xl"
          >
            <FolderPlus size={18} />
            Choose folder
          </Button>
        </div>

        {/* Recent workspaces */}
        {recentWorkspaces.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Clock size={14} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Recent projects
              </span>
            </div>

            <div className="space-y-1.5">
              {recentWorkspaces.map((wp) => (
                <button
                  key={wp}
                  onClick={() => handleSelectRecent(wp)}
                  disabled={isLoading}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-xl',
                    'border border-border/50 bg-card',
                    'hover:border-primary/30 hover:bg-primary/5',
                    'transition-all duration-150 group text-left',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                    <Folder
                      size={16}
                      className="text-muted-foreground group-hover:text-primary transition-colors"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {extractName(wp)}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {shortenPath(wp)}
                    </div>
                  </div>
                  <ArrowRight
                    size={14}
                    className="shrink-0 text-muted-foreground/40 group-hover:text-primary transition-colors"
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Info */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/30">
          <FileText
            size={16}
            className="shrink-0 mt-0.5 text-muted-foreground"
          />
          <p className="text-xs text-muted-foreground leading-relaxed">
            A hidden <code className="text-foreground">.vivexy</code> folder
            will be created inside your project to store generated files and
            artifacts. Your existing files won&apos;t be modified.
          </p>
        </div>
      </div>
    </div>
  );
};
