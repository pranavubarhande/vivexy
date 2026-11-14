'use client';

import {
  BookMarked,
  Copy,
  MoreHorizontal,
  Pencil,
  Play,
  Trash2,
  Users,
  User as UserIcon,
} from 'lucide-react';
import { Badge } from '@vivexy/ui/badge';
import { Button } from '@vivexy/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@vivexy/ui/dropdown-menu';
import type { PromptSource, SavedPrompt } from '../../types/prompt';

const SOURCE_LABELS: Record<PromptSource, string> = {
  built_in: 'Built-in',
  team: 'Team',
  personal: 'Mine',
};

const SOURCE_ICONS: Record<PromptSource, typeof Users> = {
  built_in: BookMarked,
  team: Users,
  personal: UserIcon,
};

interface PromptCardProps {
  prompt: SavedPrompt;
  canShareWithTeam: boolean;
  onUse: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: (visibility: 'personal' | 'team') => void;
}

export const PromptCard = ({
  prompt,
  canShareWithTeam,
  onUse,
  onEdit,
  onDelete,
  onDuplicate,
}: PromptCardProps) => {
  const SourceIcon = SOURCE_ICONS[prompt.source];
  return (
    <div
      data-testid="prompt-card"
      className="flex flex-col rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{prompt.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="muted" className="gap-1">
              <SourceIcon className="size-3" />
              {SOURCE_LABELS[prompt.source]}
            </Badge>
            {prompt.category && (
              <Badge variant="outline">{prompt.category}</Badge>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`${prompt.title} options`}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {prompt.canEdit && (
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="size-3.5" />
                Edit
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onDuplicate('personal')}>
              <Copy className="size-3.5" />
              Copy to my prompts
            </DropdownMenuItem>
            {canShareWithTeam && prompt.source !== 'team' && (
              <DropdownMenuItem onClick={() => onDuplicate('team')}>
                <Users className="size-3.5" />
                Share a copy with the team
              </DropdownMenuItem>
            )}
            {prompt.canEdit && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="mt-2 line-clamp-3 flex-1 text-xs text-muted-foreground">
        {prompt.description || prompt.body}
      </p>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {prompt.fields.length
            ? `${prompt.fields.length} field${prompt.fields.length === 1 ? '' : 's'}`
            : 'No fields'}
          {prompt.useCount > 0 && ` · used ${prompt.useCount}×`}
        </span>
        <Button size="sm" onClick={onUse}>
          <Play className="size-3.5" />
          Use
        </Button>
      </div>
    </div>
  );
};
