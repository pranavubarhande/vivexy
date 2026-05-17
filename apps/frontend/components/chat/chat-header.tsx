'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/utils/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { ChatHistoryDropdown } from '@/components/chat/chat-history-dropdown';
import { MobileSidebarTrigger } from '../shared/app-shell';
import {
  Plus,
  Folder,
  Info,
  MoreHorizontal,
  Pencil,
  Trash2,
  Share2,
  Check,
  FolderX,
  Users,
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Chat } from '@/services/chat.service';
import { toast } from 'sonner';
import { useRenameChat } from '@/hooks/useChat';
import {
  useProjects,
  useCreateProject,
  useAddChatToProject,
  useRemoveChatFromProject,
  useProjectChats,
  useProjectTeams,
  useShareProjectWithTeam,
  useRevokeTeamAccess,
  useUnassignedChats,
} from '@/hooks/useProjects';
import { useTeams } from '@/hooks/useTeams';

/** Sentinel stored in selectedProjectId to mean "filter to chats with no project". */
export const NO_PROJECT_FILTER = 'none';

interface ChatHeaderProps {
  chats: Chat[];
  chatId: string | null;
  isStreaming: boolean;
  basePath?: string;
  onChatSelect: (id: string) => void;
  onChatDelete: (id: string) => void;
  onNewChat: () => void;
  selectedProjectId: string | null;
  onProjectChange: (id: string | null) => void;
}

export const ChatHeader = ({
  chats,
  chatId,
  isStreaming,
  basePath,
  onChatSelect,
  onChatDelete,
  onNewChat,
  selectedProjectId,
  onProjectChange,
}: ChatHeaderProps) => {
  const { data: allProjects = [] } = useProjects();
  const isProjectSelected =
    !!selectedProjectId && selectedProjectId !== NO_PROJECT_FILTER;
  const { data: projectChats = [] } = useProjectChats(
    isProjectSelected ? selectedProjectId! : ''
  );
  const { data: unassignedChats = [] } = useUnassignedChats(
    selectedProjectId === NO_PROJECT_FILTER
  );
  const addChatToProject = useAddChatToProject();
  const removeChatFromProject = useRemoveChatFromProject();

  // Derive the selected project object from the list
  const selectedProject =
    allProjects.find((p) => p.id === selectedProjectId) ?? null;
  const accentColor = selectedProject?.color ?? '#6366f1';

  // Three-state chat filtering
  const projectChatIds = new Set(projectChats.map((c) => c.id));
  const unassignedChatIds = new Set(unassignedChats.map((c) => c.id));
  const displayChats =
    selectedProjectId === NO_PROJECT_FILTER
      ? chats.filter((c) => unassignedChatIds.has(c.id))
      : isProjectSelected
        ? chats.filter((c) => projectChatIds.has(c.id))
        : chats;

  const handleMoveToProject = async (projectId: string) => {
    try {
      if (chatId) {
        if (selectedProjectId) {
          await removeChatFromProject.mutateAsync({
            projectId: selectedProjectId,
            chatId,
          });
        }
        await addChatToProject.mutateAsync({ projectId, chatId });
        toast.success('Chat moved to project');
      }
      onProjectChange(projectId);
    } catch {
      toast.error('Failed to move chat');
    }
  };

  const handleRemoveFromProject = async () => {
    try {
      if (chatId && isProjectSelected) {
        await removeChatFromProject.mutateAsync({
          projectId: selectedProjectId!,
          chatId,
        });
        toast.success('Removed from project');
      }
      onProjectChange(null);
    } catch {
      toast.error('Failed to remove from project');
    }
  };

  const handleShare = async () => {
    if (!chatId) return;
    const url = `${window.location.origin}${basePath || '/chat'}?id=${chatId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Chat link copied');
    } catch {
      toast.error('Could not copy link');
    }
  };

  return (
    <header className="h-14 border-b border-border/50 bg-background/95 backdrop-blur-sm flex items-center justify-between px-3 sticky top-0 z-10 shrink-0 gap-2">
      {/* ── Left ── */}
      <div className="flex items-center gap-1 min-w-0">
        <MobileSidebarTrigger />
        <ChatHistoryDropdown
          chats={displayChats}
          onSelect={onChatSelect}
          onDelete={onChatDelete}
          activeChatId={chatId}
        />
        <button
          onClick={onNewChat}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
          title="New chat"
        >
          <Plus size={16} />
        </button>

        {/* Separator */}
        <div className="w-px h-4 bg-border/60 mx-1 shrink-0" />

        {/* Project selector pill */}
        <ProjectSelectorPill
          chatId={chatId}
          selectedProjectId={selectedProjectId}
          selectedProject={selectedProject}
          allProjects={allProjects}
          accentColor={accentColor}
          onMoveToProject={handleMoveToProject}
          onRemoveFromProject={handleRemoveFromProject}
          onProjectChange={onProjectChange}
        />

        {/* Info icon — only when a project is selected */}
        {selectedProject && <ProjectInfoButton project={selectedProject} />}
      </div>

      {/* ── Right ── */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Status dot */}
        <div
          className={cn(
            'flex items-center gap-1.5 text-xs font-medium text-muted-foreground px-2',
            isStreaming && 'text-primary'
          )}
        >
          <div
            className={cn(
              'w-1.5 h-1.5 rounded-full shrink-0',
              isStreaming
                ? 'bg-primary animate-pulse'
                : 'bg-muted-foreground/30'
            )}
          />
          <span className="hidden sm:inline">
            {isStreaming ? 'Generating…' : 'Idle'}
          </span>
        </div>

        {/* Chat three-dot menu */}
        {chatId && (
          <ChatOptionsMenu
            chatId={chatId}
            chatTitle={chats.find((c) => c.id === chatId)?.title ?? null}
            onDelete={() => onChatDelete(chatId)}
            onShare={handleShare}
          />
        )}
      </div>
    </header>
  );
};

// ─── Project selector pill ────────────────────────────────────────────────────

const PROJECT_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f97316',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
];

function ProjectSelectorPill({
  chatId,
  selectedProjectId,
  selectedProject,
  allProjects,
  accentColor,
  onMoveToProject,
  onRemoveFromProject,
  onProjectChange,
}: {
  chatId: string | null;
  selectedProjectId: string | null;
  selectedProject: { id: string; name: string; color: string | null } | null;
  allProjects: { id: string; name: string; color: string | null }[];
  accentColor: string;
  onMoveToProject: (id: string) => void;
  onRemoveFromProject: () => void;
  onProjectChange: (id: string | null) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newColor, setNewColor] = useState(PROJECT_COLORS[0]);
  const createProject = useCreateProject();

  const otherProjects = allProjects.filter((p) => p.id !== selectedProject?.id);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const project = await createProject.mutateAsync({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        color: newColor,
      });
      setCreateOpen(false);
      setNewName('');
      setNewDescription('');
      setNewColor(PROJECT_COLORS[0]);
      toast.success('Project created');
      // If a chat is open, move it; otherwise just select the project for future chats
      if (chatId) onMoveToProject(project.id);
      else onProjectChange(project.id);
    } catch {
      toast.error('Failed to create project');
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors shrink-0',
              selectedProject
                ? 'bg-opacity-15 hover:bg-opacity-25'
                : selectedProject === null &&
                    selectedProjectId === NO_PROJECT_FILTER
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
            style={
              selectedProject
                ? { backgroundColor: accentColor + '18', color: accentColor }
                : undefined
            }
            title={
              selectedProject
                ? `Project: ${selectedProject.name}`
                : selectedProjectId === NO_PROJECT_FILTER
                  ? 'Showing chats with no project'
                  : 'All chats'
            }
          >
            {selectedProjectId === NO_PROJECT_FILTER ? (
              <FolderX size={12} />
            ) : (
              <Folder size={12} />
            )}
            <span className="max-w-[120px] truncate">
              {selectedProject
                ? selectedProject.name
                : selectedProjectId === NO_PROJECT_FILTER
                  ? 'No Project'
                  : 'All Chats'}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuLabel className="text-xs">
            {chatId ? 'Move to project' : 'Filter chats'}
          </DropdownMenuLabel>

          {/* All chats option */}
          <DropdownMenuItem
            onClick={() => onProjectChange(null)}
            className="gap-2 text-xs"
          >
            <Check
              size={12}
              className={cn(
                'shrink-0',
                selectedProjectId === null ? 'opacity-100' : 'opacity-0'
              )}
            />
            All Chats
          </DropdownMenuItem>

          {/* No project option */}
          <DropdownMenuItem
            onClick={() => onProjectChange(NO_PROJECT_FILTER)}
            className="gap-2 text-xs"
          >
            <Check
              size={12}
              className={cn(
                'shrink-0',
                selectedProjectId === NO_PROJECT_FILTER
                  ? 'opacity-100'
                  : 'opacity-0'
              )}
            />
            <FolderX size={12} className="shrink-0 text-muted-foreground" />
            No Project
          </DropdownMenuItem>

          {allProjects.length > 0 && <DropdownMenuSeparator />}

          {allProjects.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onClick={() =>
                chatId ? onMoveToProject(p.id) : onProjectChange(p.id)
              }
              className="gap-2 text-xs"
            >
              <Check
                size={12}
                className={cn(
                  'shrink-0',
                  selectedProjectId === p.id ? 'opacity-100' : 'opacity-0'
                )}
              />
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: p.color ?? '#6366f1' }}
              />
              <span className="truncate">{p.name}</span>
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setCreateOpen(true);
            }}
            className="gap-2 text-xs font-medium"
          >
            <Plus size={13} />
            New project
          </DropdownMenuItem>

          {/* Remove from project (only when an existing chat is open and in a project) */}
          {chatId && selectedProject && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onRemoveFromProject}
                className="gap-2 text-xs text-muted-foreground"
              >
                <FolderX size={13} />
                Remove from project
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create project dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
            <DialogDescription>
              Create a project and add this chat to it.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="grid gap-3 py-3">
              <div className="grid gap-1.5">
                <Label htmlFor="proj-name" className="text-xs">
                  Name
                </Label>
                <Input
                  id="proj-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Q3 Research"
                  autoFocus
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="proj-desc" className="text-xs">
                  Description{' '}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="proj-desc"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={2}
                  className="resize-none"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Color</Label>
                <div className="flex gap-2">
                  {PROJECT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className="h-6 w-6 rounded-full border-2 transition-all"
                      style={{
                        backgroundColor: c,
                        borderColor:
                          newColor === c
                            ? 'hsl(var(--foreground))'
                            : 'transparent',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                size="sm"
                disabled={!newName.trim() || createProject.isPending}
              >
                {createProject.isPending ? 'Creating…' : 'Create & add chat'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Project info button + modal ─────────────────────────────────────────────

function ProjectInfoButton({
  project,
}: {
  project: {
    id: string;
    name: string;
    color: string | null;
    description: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const [shareTeamId, setShareTeamId] = useState('');
  const { data: teams, refetch: refetchTeams } = useProjectTeams(project.id);
  const { data: allTeams = [] } = useTeams();
  const shareWithTeam = useShareProjectWithTeam();
  const revokeAccess = useRevokeTeamAccess();
  const accentColor = project.color ?? '#6366f1';

  const sharedTeamIds = new Set((teams ?? []).map((pt) => pt.teamId));
  const availableTeams = allTeams.filter((t) => !sharedTeamIds.has(t.id));

  const handleShare = async () => {
    if (!shareTeamId) return;
    try {
      await shareWithTeam.mutateAsync({
        projectId: project.id,
        teamId: shareTeamId,
      });
      setShareTeamId('');
      refetchTeams();
      toast.success('Project shared with team');
    } catch {
      toast.error('Failed to share project');
    }
  };

  const handleRevoke = async (teamId: string, teamName: string) => {
    if (!confirm(`Remove ${teamName}'s access?`)) return;
    try {
      await revokeAccess.mutateAsync({ projectId: project.id, teamId });
      refetchTeams();
      toast.success('Team access revoked');
    } catch {
      toast.error('Failed to revoke access');
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
        title={`Project: ${project.name}`}
      >
        <Info size={14} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <div
                className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: accentColor + '20' }}
              >
                <Folder size={14} style={{ color: accentColor }} />
              </div>
              {project.name}
            </DialogTitle>
            {project.description && (
              <DialogDescription>{project.description}</DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Current shared teams */}
            <div>
              <p className="text-xs font-medium mb-2 flex items-center gap-1.5">
                <Users size={12} />
                Shared with teams
              </p>
              {(teams ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Not shared with any team yet.
                </p>
              ) : (
                <div className="space-y-1">
                  {teams!.map((pt) => (
                    <div
                      key={pt.id}
                      className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-1.5 group"
                    >
                      <span className="text-xs font-medium">
                        {pt.team.name}
                      </span>
                      <button
                        onClick={() => handleRevoke(pt.teamId, pt.team.name)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        disabled={revokeAccess.isPending}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Share with a new team */}
            {availableTeams.length > 0 && (
              <div className="flex gap-2">
                <Select value={shareTeamId} onValueChange={setShareTeamId}>
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Add a team…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTeams.map((t) => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="h-8 gap-1.5 shrink-0"
                  onClick={handleShare}
                  disabled={!shareTeamId || shareWithTeam.isPending}
                >
                  <Share2 size={13} />
                  Share
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Chat three-dot menu ──────────────────────────────────────────────────────

function ChatOptionsMenu({
  chatId,
  chatTitle,
  onDelete,
  onShare,
}: {
  chatId: string;
  chatTitle: string | null;
  onDelete: () => void;
  onShare: () => void;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameChat = useRenameChat();
  const inputRef = useRef<HTMLInputElement>(null);

  const openRename = () => {
    setRenameValue(chatTitle ?? '');
    setRenameOpen(true);
  };

  useEffect(() => {
    if (renameOpen) setTimeout(() => inputRef.current?.select(), 50);
  }, [renameOpen]);

  const handleRenameConfirm = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    try {
      await renameChat.mutateAsync({ chatId, title: trimmed });
      setRenameOpen(false);
      toast.success('Chat renamed');
    } catch {
      toast.error('Failed to rename chat');
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground"
          >
            <MoreHorizontal size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={openRename} className="gap-2 text-xs">
            <Pencil size={13} />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onShare} className="gap-2 text-xs">
            <Share2 size={13} />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onDelete}
            className="gap-2 text-xs text-destructive focus:text-destructive"
          >
            <Trash2 size={13} />
            Delete chat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-[340px]">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              ref={inputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Chat title"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameConfirm();
                if (e.key === 'Escape') setRenameOpen(false);
              }}
            />
          </div>
          <DialogFooter>
            <Button
              size="sm"
              onClick={handleRenameConfirm}
              disabled={!renameValue.trim() || renameChat.isPending}
              className="gap-1.5"
            >
              <Check size={13} />
              {renameChat.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
