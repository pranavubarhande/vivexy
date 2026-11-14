'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookMarked, Loader2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@vivexy/ui/button';
import { Input } from '@vivexy/ui/input';
import { EmptyState, PageContainer, PageHeader } from '@vivexy/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@vivexy/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@vivexy/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@vivexy/ui/alert-dialog';
import { PromptCard } from '@vivexy/core/prompts/prompt-card';
import { PromptEditorDialog } from '@vivexy/core/prompts/prompt-editor-dialog';
import { UsePromptDialog } from '@vivexy/core/prompts/use-prompt-dialog';
import { useActiveTeam } from '@vivexy/core/hooks/useActiveTeam';
import {
  useDeletePrompt,
  useDuplicatePrompt,
  usePrompts,
} from '@vivexy/core/hooks/usePrompts';
import { getApiErrorMessage } from '@vivexy/core/lib/admin-format';
import { queuePromptForChat } from '@vivexy/core/lib/prompts';
import type { PromptSource, SavedPrompt } from '@vivexy/core/types/prompt';

const ALL = '__all__';
type SourceFilter = PromptSource | typeof ALL;

const matchesSearch = (prompt: SavedPrompt, search: string) => {
  const haystack = [
    prompt.title,
    prompt.description,
    prompt.category,
    prompt.body,
  ]
    .join(' ')
    .toLowerCase();
  return search
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
};

export interface PromptLibraryScreenProps {
  /** Team whose shared prompts to show. Defaults to the active team. */
  teamId?: string | null;
  /** Where "Use" sends the filled-in prompt. Defaults to a new chat. */
  onRun?: (text: string) => void;
  chatPath?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
}

export const PromptLibraryScreen = ({
  teamId,
  onRun,
  chatPath = '/chat',
  eyebrow = 'Library',
  title = 'Prompt library',
  description = 'Ready-made prompts with fill-in fields. Use one to start a chat, or save your own and share them with your team.',
}: PromptLibraryScreenProps) => {
  const router = useRouter();
  const { activeTeamId } = useActiveTeam();
  const effectiveTeamId = teamId === undefined ? activeTeamId : teamId;
  const { data, isLoading } = usePrompts(effectiveTeamId);
  const [source, setSource] = useState<SourceFilter>(ALL);
  const [category, setCategory] = useState(ALL);
  const [search, setSearch] = useState('');
  const [using, setUsing] = useState<SavedPrompt | null>(null);
  const [editing, setEditing] = useState<SavedPrompt | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleting, setDeleting] = useState<SavedPrompt | null>(null);
  const deletePrompt = useDeletePrompt();
  const duplicatePrompt = useDuplicatePrompt();

  const canShareWithTeam = !!effectiveTeamId && !!data?.canManageTeamPrompts;
  const prompts = useMemo(
    () =>
      (data?.prompts ?? []).filter(
        (prompt) =>
          (source === ALL || prompt.source === source) &&
          (category === ALL || prompt.category === category) &&
          (!search.trim() || matchesSearch(prompt, search.trim()))
      ),
    [data, source, category, search]
  );

  const run =
    onRun ??
    ((text: string) => {
      queuePromptForChat(text);
      router.push(chatPath);
    });

  const openEditor = (prompt: SavedPrompt | null) => {
    setEditing(prompt);
    setEditorOpen(true);
  };

  return (
    <PageContainer size="wide">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={
          <Button onClick={() => openEditor(null)}>
            <Plus className="size-4" />
            New prompt
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs
          value={source}
          onValueChange={(value) => setSource(value as SourceFilter)}
        >
          <TabsList>
            <TabsTrigger value={ALL}>All</TabsTrigger>
            <TabsTrigger value="built_in">Built-in</TabsTrigger>
            {effectiveTeamId && <TabsTrigger value="team">Team</TabsTrigger>}
            <TabsTrigger value="personal">Mine</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-48" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {(data?.categories ?? []).map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search prompts"
            className="h-9 pl-8"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading prompts…
        </div>
      ) : prompts.length === 0 ? (
        <EmptyState
          icon={<BookMarked />}
          title="No prompts here"
          description={
            search || category !== ALL || source !== ALL
              ? 'Nothing matches these filters.'
              : 'Save a prompt you use often so it is one click away.'
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {prompts.map((prompt) => (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              canShareWithTeam={canShareWithTeam}
              onUse={() => setUsing(prompt)}
              onEdit={() => openEditor(prompt)}
              onDelete={() => setDeleting(prompt)}
              onDuplicate={(visibility) =>
                duplicatePrompt.mutate(
                  {
                    promptId: prompt.id,
                    visibility,
                    teamId: visibility === 'team' ? effectiveTeamId : null,
                  },
                  {
                    onSuccess: () =>
                      toast.success(
                        visibility === 'team'
                          ? 'Shared a copy with the team'
                          : 'Copied to your prompts'
                      ),
                    onError: (error) =>
                      toast.error(
                        getApiErrorMessage(error, 'Could not copy the prompt')
                      ),
                  }
                )
              }
            />
          ))}
        </div>
      )}

      <UsePromptDialog
        prompt={using}
        onOpenChange={(open) => !open && setUsing(null)}
        onRun={run}
      />
      <PromptEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        prompt={editing}
        teamId={effectiveTeamId}
        canShareWithTeam={canShareWithTeam}
      />
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.source === 'team'
                ? 'It is removed for everyone in the team.'
                : 'This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleting &&
                deletePrompt.mutate(deleting.id, {
                  onError: (error) =>
                    toast.error(
                      getApiErrorMessage(error, 'Could not delete the prompt')
                    ),
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
};

export default function PromptLibraryPage() {
  return <PromptLibraryScreen />;
}
