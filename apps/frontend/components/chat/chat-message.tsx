'use client';

import { cn } from '@vivexy/ui/utils';
import { MessageStream } from './message-stream';
import { StepItem } from './reasoning-display';
import { InlineArtifactCard } from './inline-artifact-card';
import { InlineTodoList } from './inline-todo-list';
import { CHARTJS_IFRAME } from './artifact-content';
import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import {
  RotateCcw,
  Copy,
  Check,
  Paperclip,
  Loader2,
  Download,
  FileText,
  Zap,
  KeyRound,
} from 'lucide-react';
import {
  Message,
  Artifact,
  TimelineItem,
  ReasoningStep,
} from '@vivexy/core/services/chat.service';
import type {
  MessageAttachment,
  TokenUsageData,
} from '@vivexy/core/types/chat';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@vivexy/ui/dialog';
import { Button } from '@vivexy/ui/button';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const formatTime = (iso: string) => {
  const dateString = iso.endsWith('Z') ? iso : `${iso}Z`;
  return new Date(dateString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ---------------------------------------------------------------------------
// Reconstruct timeline from persisted reasoning + content
// ---------------------------------------------------------------------------

const buildTimelineFromReasoning = (
  reasoning: ReasoningStep[] | undefined,
  content: string
): TimelineItem[] => {
  const timeline: TimelineItem[] = [];

  if (reasoning && reasoning.length > 0) {
    for (const step of reasoning) {
      timeline.push({ type: 'step', step });

      const tc = step.toolCalls?.[0];
      if (tc?.tool === 'render_chart' && tc.output) {
        try {
          const parsed = JSON.parse(tc.output);
          if (parsed?.chart_spec) {
            timeline.push({
              type: 'chart',
              spec: parsed.chart_spec,
              title: parsed.title ?? 'Chart',
            });
          }
        } catch {
          // non-JSON output — skip
        }
      }
    }
  }

  if (content) {
    timeline.push({ type: 'content', text: content });
  }

  return timeline;
};

// ---------------------------------------------------------------------------
// Group consecutive step items
// ---------------------------------------------------------------------------

interface ContentItem {
  kind: 'content';
  text: string;
  isLastStreaming: boolean;
}

interface SingleStepItem {
  kind: 'step';
  step: ReasoningStep;
  isStreaming: boolean;
}

interface ChartItem {
  kind: 'chart';
  spec: Record<string, unknown>;
  title: string;
}

type RenderItem = ContentItem | SingleStepItem | ChartItem;

const groupTimelineItems = (
  timeline: TimelineItem[],
  isStreaming?: boolean
): RenderItem[] => {
  const result: RenderItem[] = [];
  let stepBuffer: ReasoningStep[] = [];

  const flushSteps = () => {
    for (const step of stepBuffer) {
      result.push({ kind: 'step', step, isStreaming: !!isStreaming });
    }
    stepBuffer = [];
  };

  for (let i = 0; i < timeline.length; i++) {
    const item = timeline[i];
    if (item.type === 'step') {
      stepBuffer.push(item.step);
    } else if (item.type === 'chart') {
      flushSteps();
      result.push({ kind: 'chart', spec: item.spec, title: item.title });
    } else {
      flushSteps();
      result.push({
        kind: 'content',
        text: item.text,
        isLastStreaming: !!isStreaming && i === timeline.length - 1,
      });
    }
  }

  flushSteps();
  return result;
};

// ---------------------------------------------------------------------------
// Attachment chip (inline button, replaces old anchor)
// ---------------------------------------------------------------------------

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

function AttachmentChip({
  att,
  onClick,
}: {
  att: MessageAttachment;
  onClick: () => void;
}) {
  const isTemp =
    att.id.startsWith('temp-attach-') || att.id.startsWith('temp-');
  const isImage = att.mimeType?.startsWith('image/');
  const ext = att.filename.split('.').pop()?.toUpperCase() ?? 'FILE';
  const contentUrl = `${API_URL}/chat/${att.chatId}/attachments/${att.id}/content`;

  if (isImage) {
    return (
      <button
        type="button"
        onClick={isTemp ? undefined : onClick}
        disabled={isTemp}
        className={cn(
          'relative h-14 w-20 rounded-lg overflow-hidden border border-border/60 bg-muted shrink-0 transition-opacity',
          isTemp
            ? 'opacity-60 cursor-default'
            : 'hover:opacity-90 cursor-pointer'
        )}
        title={isTemp ? 'Uploading…' : att.filename}
      >
        {isTemp ? (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={contentUrl}
            alt={att.filename}
            className="w-full h-full object-cover"
          />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={isTemp ? undefined : onClick}
      disabled={isTemp}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/60 bg-background/60 text-xs shrink-0 transition-colors',
        isTemp
          ? 'opacity-60 cursor-default'
          : 'hover:bg-muted/60 cursor-pointer'
      )}
      title={isTemp ? 'Uploading…' : att.filename}
    >
      {isTemp ? (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
      ) : (
        <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
      )}
      <span className="font-medium truncate max-w-[100px]">{att.filename}</span>
      <span className="text-muted-foreground shrink-0">
        {isTemp ? '…' : ext}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Attachment modal (preview or download)
// ---------------------------------------------------------------------------

function AttachmentModal({
  att,
  onClose,
}: {
  att: MessageAttachment;
  onClose: () => void;
}) {
  const isImage = att.mimeType?.startsWith('image/');
  const isPdf = att.mimeType === 'application/pdf';
  const isText =
    att.mimeType?.startsWith('text/') || att.mimeType === 'application/json';
  const contentUrl = `${API_URL}/chat/${att.chatId}/attachments/${att.id}/content`;
  const ext = att.filename.split('.').pop()?.toUpperCase() ?? 'FILE';

  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(isText);
  const [textError, setTextError] = useState(false);

  useEffect(() => {
    if (!isText) return;
    fetch(contentUrl)
      .then((r) => r.text())
      .then((t) => setTextContent(t))
      .catch(() => setTextError(true))
      .finally(() => setTextLoading(false));
  }, [contentUrl, isText]);

  const canPreview = isImage || isPdf || isText;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          'flex flex-col gap-0 p-0 overflow-hidden',
          isPdf || isText ? 'max-w-4xl h-[85vh]' : 'max-w-3xl'
        )}
      >
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="truncate pr-6 text-base">
            {att.filename}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {ext} · {formatSize(att.size)}
          </DialogDescription>
        </DialogHeader>

        {/* Content area */}
        <div
          className={cn(
            'flex-1 overflow-auto min-h-0',
            isImage && 'flex items-center justify-center bg-muted/30 p-4',
            isPdf && 'p-0',
            isText && 'p-4'
          )}
        >
          {isImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={contentUrl}
              alt={att.filename}
              className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
            />
          )}

          {isPdf && (
            <iframe
              src={contentUrl}
              className="w-full h-full border-0"
              title={att.filename}
            />
          )}

          {isText && (
            <>
              {textLoading && (
                <div className="flex items-center justify-center h-32 text-muted-foreground gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading…</span>
                </div>
              )}
              {textError && (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
                  <FileText className="h-8 w-8" />
                  <span className="text-sm">Could not load file content</span>
                </div>
              )}
              {textContent !== null && (
                <pre className="text-xs font-mono whitespace-pre-wrap wrap-break-word leading-relaxed text-foreground">
                  {textContent}
                </pre>
              )}
            </>
          )}

          {!canPreview && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <FileText className="h-14 w-14 opacity-40" />
              <p className="text-sm font-medium">
                Preview not available for {ext} files
              </p>
              <p className="text-xs">Download the file to open it.</p>
            </div>
          )}
        </div>

        {/* Footer — always show download */}
        <DialogFooter className="px-5 py-3 border-t shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button asChild size="sm">
            <a href={contentUrl} download={att.filename}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Download
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// User message
// ---------------------------------------------------------------------------

interface UserMessageProps {
  message: Message;
  onRevert?: (messageId: string, content: string) => void;
}

export function UserMessage({ message, onRevert }: UserMessageProps) {
  const [modalAtt, setModalAtt] = useState<MessageAttachment | null>(null);
  const attachments = message.attachments ?? [];

  return (
    <div className="space-y-2 items-end flex flex-col max-w-[85%]">
      {/* Text bubble */}
      {message.content && (
        <div className="rounded-2xl px-4 py-3 shadow-sm bg-muted text-foreground border border-border/40">
          <MessageStream
            content={message.content}
            role={message.role}
            isStreaming={message.isStreaming}
          />
        </div>
      )}

      {/* Attachments — all in one row below the bubble, right-aligned */}
      {attachments.length > 0 && (
        <div className="flex gap-1.5 flex-wrap justify-end max-w-full">
          {attachments.map((att) => (
            <AttachmentChip
              key={att.id}
              att={att}
              onClick={() => setModalAtt(att)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 px-2">
        <span className="text-[10px] text-muted-foreground">
          {formatTime(message.createdAt)}
        </span>
        {!message.id.startsWith('temp-') && onRevert && (
          <button
            onClick={() => onRevert(message.id, message.content)}
            title="Revert to this message"
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw size={11} />
            Revert
          </button>
        )}
      </div>

      {/* Modal */}
      {modalAtt && (
        <AttachmentModal att={modalAtt} onClose={() => setModalAtt(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assistant message
// ---------------------------------------------------------------------------

interface AssistantMessageProps {
  message: Message;
  showReasoning?: boolean;
}

export function AssistantMessage({
  message,
  showReasoning = true,
}: AssistantMessageProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const effectiveTimeline = useMemo(() => {
    if (message.timeline && message.timeline.length > 0) {
      return message.timeline;
    }
    if (message.reasoning && message.reasoning.length > 0) {
      return buildTimelineFromReasoning(message.reasoning, message.content);
    }
    return null;
  }, [message.timeline, message.reasoning, message.content]);

  const groupedItems = useMemo(() => {
    if (!effectiveTimeline) return null;
    return groupTimelineItems(effectiveTimeline, message.isStreaming);
  }, [effectiveTimeline, message.isStreaming]);

  return (
    <div className="w-full space-y-2 group">
      <div className="w-full">
        {message.todos && message.todos.length > 0 && (
          <InlineTodoList todos={message.todos} />
        )}
        {showReasoning && groupedItems ? (
          <>
            {groupedItems.map((item, i) => {
              if (item.kind === 'step') {
                return (
                  <div key={i} className="my-1">
                    <StepItem step={item.step} isStreaming={item.isStreaming} />
                  </div>
                );
              }
              if (item.kind === 'chart') {
                return (
                  <iframe
                    key={i}
                    srcDoc={CHARTJS_IFRAME(JSON.stringify(item.spec))}
                    sandbox="allow-scripts"
                    className="w-full rounded-xl border border-border my-2"
                    style={{ height: '380px' }}
                    title={item.title}
                  />
                );
              }
              return (
                <MessageStream
                  key={i}
                  content={item.text}
                  role={message.role}
                  isStreaming={item.isLastStreaming}
                />
              );
            })}
          </>
        ) : (
          <MessageStream
            content={message.content}
            role={message.role}
            isStreaming={message.isStreaming}
          />
        )}
        {message.artifacts && message.artifacts.length > 0 && (
          <div className="mt-3 space-y-3">
            {message.artifacts.map((art: Artifact) => (
              <InlineArtifactCard key={art.id} artifact={art} />
            ))}
          </div>
        )}
        {message.errorAction && (
          <Button asChild variant="outline" size="sm" className="mt-2">
            <Link href={message.errorAction.href}>
              <KeyRound className="size-3.5" />
              {message.errorAction.label}
            </Link>
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2 px-2">
        <span className="text-[10px] text-muted-foreground">
          {formatTime(message.createdAt)}
        </span>
        <button
          onClick={handleCopy}
          title="Copy message"
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        {message.tokenUsage && !message.isStreaming && (
          <TokenUsagePill usage={message.tokenUsage} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Token usage pill
// ---------------------------------------------------------------------------

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtCost(n: number): string {
  if (n === 0) return '';
  if (n < 0.0001) return '<$0.0001';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(3)}`;
}

function TokenUsagePill({ usage }: { usage: TokenUsageData }) {
  const costStr = fmtCost(usage.totalCostUsd);
  const title = [
    `Input: ${fmtTokens(usage.inputTokens)} tokens`,
    `Output: ${fmtTokens(usage.outputTokens)} tokens`,
    `Total: ${fmtTokens(usage.totalTokens)} tokens`,
    costStr ? `Cost: ${costStr}` : '',
    usage.modelName ? `Model: ${usage.modelName}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 hover:text-muted-foreground transition-colors cursor-default select-none"
    >
      <Zap size={9} className="shrink-0" />
      {fmtTokens(usage.totalTokens)}
      {costStr && <span className="text-muted-foreground/50">· {costStr}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

interface ChatMessageProps {
  message: Message;
  showReasoning?: boolean;
  onRevert?: (messageId: string, content: string) => void;
}

export function ChatMessage({
  message,
  showReasoning,
  onRevert,
}: ChatMessageProps) {
  return (
    <div
      className={cn(
        'group animate-in fade-in slide-in-from-bottom-2 duration-300',
        message.role === 'user'
          ? 'flex justify-end pl-4'
          : 'flex flex-col w-full'
      )}
    >
      {message.role === 'user' ? (
        <UserMessage message={message} onRevert={onRevert} />
      ) : (
        <AssistantMessage message={message} showReasoning={showReasoning} />
      )}
    </div>
  );
}
