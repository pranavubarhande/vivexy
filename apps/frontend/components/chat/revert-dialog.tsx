'use client';

import React from 'react';
import {
  MessageSquare,
  GitBranch,
  Layers,
  X,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/utils/common';
import { platform } from '@/lib/platform';

export type RevertMode = 'messages' | 'code' | 'both';

interface RevertDialogProps {
  open: boolean;
  messagePreview: string;
  hasGitSnapshot: boolean;
  isReverting: boolean;
  onConfirm: (mode: RevertMode) => void;
  onClose: () => void;
}

interface OptionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  disabled?: boolean;
  disabledReason?: string;
  destructive?: boolean;
  onClick: () => void;
  loading?: boolean;
}

function OptionCard({
  icon,
  title,
  description,
  badge,
  disabled,
  disabledReason,
  destructive,
  onClick,
  loading,
}: OptionCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'w-full text-left rounded-xl border p-3.5 transition-all group relative',
        disabled
          ? 'opacity-40 cursor-not-allowed bg-muted/20 border-border/40'
          : destructive
            ? 'hover:border-destructive/40 hover:bg-destructive/5 border-border bg-background'
            : 'hover:border-primary/40 hover:bg-primary/5 border-border bg-background'
      )}
      title={disabled ? disabledReason : undefined}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'mt-0.5 shrink-0 p-1.5 rounded-lg',
            disabled
              ? 'bg-muted text-muted-foreground'
              : destructive
                ? 'bg-destructive/10 text-destructive group-hover:bg-destructive/15'
                : 'bg-primary/10 text-primary group-hover:bg-primary/15'
          )}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{title}</span>
            {badge && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {disabled && disabledReason ? disabledReason : description}
          </p>
        </div>
      </div>
    </button>
  );
}

export function RevertDialog({
  open,
  messagePreview,
  hasGitSnapshot,
  isReverting,
  onConfirm,
  onClose,
}: RevertDialogProps) {
  if (!open) return null;

  const isDesktop = platform.isDesktop;
  const codeRevertAvailable = isDesktop && hasGitSnapshot;

  const preview =
    messagePreview.length > 60
      ? messagePreview.slice(0, 60).trimEnd() + '…'
      : messagePreview;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-background border shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Revert conversation</h2>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              "{preview}"
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>

        {/* Warning */}
        <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
          <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
            This removes messages after this point. Code revert cannot be
            undone.
          </p>
        </div>

        {/* Options */}
        <div className="px-4 pb-4 space-y-2">
          <OptionCard
            icon={<MessageSquare size={14} />}
            title="Edit message"
            description="Remove this message and everything after it."
            onClick={() => onConfirm('messages')}
            loading={isReverting}
          />

          <OptionCard
            icon={<GitBranch size={14} />}
            title="Revert code only"
            description="Restore files to the state before this message was sent. Conversation stays."
            badge={isDesktop ? 'local git' : 'desktop only'}
            disabled={!codeRevertAvailable}
            disabledReason={
              !isDesktop
                ? 'Code revert is only available in the desktop app'
                : 'No git snapshot available for this message'
            }
            onClick={() => onConfirm('code')}
            loading={isReverting}
          />

          <OptionCard
            icon={<Layers size={14} />}
            title="Revert everything"
            description="Restore files to before this message AND remove it from the conversation."
            badge={isDesktop ? 'local git' : 'desktop only'}
            disabled={!codeRevertAvailable}
            disabledReason={
              !isDesktop
                ? 'Code revert is only available in the desktop app'
                : 'No git snapshot available for this message'
            }
            destructive
            onClick={() => onConfirm('both')}
            loading={isReverting}
          />
        </div>
      </div>
    </div>
  );
}
