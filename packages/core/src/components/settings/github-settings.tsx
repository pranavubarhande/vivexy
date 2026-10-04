'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { Github, CheckCircle2, LogOut, Loader2 } from 'lucide-react';
import {
  useGithubStatus,
  useGithubDisconnect,
} from '@vivexy/core/hooks/useGithub';
import { githubService } from '@vivexy/core/services/github.service';
import { Avatar, AvatarFallback, AvatarImage } from '@vivexy/ui/avatar';
import { Button } from '@vivexy/ui/button';

export const GithubSettings = () => {
  const { data: status, isLoading } = useGithubStatus();
  const disconnectMutation = useGithubDisconnect();

  // Handle OAuth callback param
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('github_connected') === 'true') {
      toast.success('GitHub connected successfully');
      url.searchParams.delete('github_connected');
      window.history.replaceState({}, '', url.pathname + url.search);
    } else if (url.searchParams.get('github_error')) {
      toast.error(
        `GitHub connection failed: ${url.searchParams.get('github_error')}`
      );
      url.searchParams.delete('github_error');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, []);

  const handleConnect = async () => {
    try {
      const { url } = await githubService.getAuthUrl();
      window.location.href = url;
    } catch {
      toast.error('Failed to get GitHub auth URL');
    }
  };

  const handleDisconnect = () => {
    disconnectMutation.mutate();
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Github size={18} className="text-foreground" />
        </div>
        <div>
          <h3 className="font-semibold text-sm">GitHub</h3>
          <p className="text-xs text-muted-foreground">
            Connect your GitHub account to work with repositories
          </p>
        </div>
      </div>

      <div className="border-t pt-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            <span>Checking connection…</span>
          </div>
        ) : status?.connected && status.connection ? (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage
                  src={status.connection.githubAvatar ?? undefined}
                  alt={status.connection.githubUsername}
                />
                <AvatarFallback className="text-xs">
                  {status.connection.githubUsername.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-green-500" />
                  <span className="text-sm font-medium">
                    @{status.connection.githubUsername}
                  </span>
                </div>
                {status.connection.scope && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Scope: {status.connection.scope}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnectMutation.isPending}
              className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            >
              {disconnectMutation.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <LogOut size={13} />
              )}
              Disconnect
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleConnect}
            className="gap-2"
          >
            <Github size={14} />
            Connect GitHub
          </Button>
        )}
      </div>
    </div>
  );
};
