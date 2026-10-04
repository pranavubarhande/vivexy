'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { cn } from '@vivexy/ui/utils';
import {
  ChevronDown,
  ChevronRight,
  Terminal,
  Brain,
  Loader2,
  Square,
  AlertCircle,
  Check,
  Circle,
} from 'lucide-react';
import type { ReasoningStep } from '@vivexy/core/types/chat';
import { chatService } from '@vivexy/core/services/chat.service';

import { toast } from 'sonner';

export type { ReasoningStep };

// ---------------------------------------------------------------------------
// Single step — compact inline row. Used inside ToolCallGroup.
// ---------------------------------------------------------------------------

interface StepItemProps {
  step: ReasoningStep;
  isStreaming?: boolean;
}

const formatToolName = (name: string): string => {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const cleanThought = (thought: string, toolName?: string): string => {
  if (!thought) return '';
  let cleaned = thought;
  if (toolName) {
    cleaned = cleaned.replace(`Using tool: ${toolName}`, '').trim();
  }
  return cleaned;
};

export function StepItem({ step, isStreaming }: StepItemProps) {
  const OPEN_BY_DEFAULT = [
    'write_todos',
    'execute_code',
    'task',
    'analyze_data',
    'read_url',
    'upload_sandbox_file_to_chat',
  ];
  const [expanded, setExpanded] = useState(() => {
    if (step.toolCalls?.[0]?.tool) {
      return OPEN_BY_DEFAULT.includes(step.toolCalls[0].tool);
    }
    return false;
  });
  const [isStopping, setIsStopping] = useState(false);
  const params = useParams<{ id: string }>();
  const chatId = params?.id;

  const toolCall = step.toolCalls?.[0];
  const toolName = toolCall?.tool;
  const isDone = !!toolCall?.output;
  const isStopped = toolCall?.output?.includes('Execution stopped by user');
  const thought = cleanThought(step.thought, toolName);

  const handleStop = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!chatId || !toolName || isStopping) return;

      setIsStopping(true);
      try {
        await chatService.cancelTool(chatId, toolName);
        toast.success('Stop signal sent to sandbox');
      } catch (error) {
        console.error('Failed to cancel tool:', error);
        const err = error as { response?: { data?: { error?: string } } };
        const msg = err?.response?.data?.error || 'Failed to cancel tool';
        toast.error(msg);
        setIsStopping(false);
      }
    },
    [chatId, toolName, isStopping]
  );

  if (toolCall) {
    return (
      <div className="group/step">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center gap-2 px-1.5 py-1 rounded-md text-left hover:bg-muted/50 transition-colors"
        >
          <div
            className={cn(
              'w-4 h-4 rounded flex items-center justify-center shrink-0',
              isStopped
                ? 'text-red-500'
                : isDone
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-blue-500'
            )}
          >
            {isStopped ? (
              <AlertCircle size={10} />
            ) : !isDone && isStreaming ? (
              <Loader2 size={10} className="animate-spin" />
            ) : (
              <Terminal size={10} />
            )}
          </div>
          <span className="text-[12px] font-medium text-foreground/90 shrink-0">
            {formatToolName(toolName || toolCall.tool)}
          </span>
          {thought && (
            <span className="text-[12px] text-muted-foreground/50 truncate hidden sm:inline">
              {thought.split('\n')[0]}
            </span>
          )}

          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            {!isDone && isStreaming && (
              <div
                onClick={handleStop}
                className={cn(
                  'flex items-center justify-center w-5 h-5 rounded-md hover:bg-red-500/20 text-red-500 transition-colors',
                  isStopping && 'opacity-50 pointer-events-none'
                )}
                title="Stop task"
              >
                {isStopping ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <Square size={10} className="fill-current" />
                )}
              </div>
            )}
            <span
              className={cn(
                'text-[10px] font-semibold uppercase tracking-tight px-1.5 py-0.5 rounded-md',
                isStopped
                  ? 'text-red-500 bg-red-500/10'
                  : isDone
                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                    : 'text-blue-500 bg-blue-500/10'
              )}
            >
              {isStopped ? 'stopped' : isDone ? 'done' : 'running'}
            </span>
            <ChevronRight
              size={10}
              className={cn(
                'text-muted-foreground/30 transition-transform',
                expanded && 'rotate-90'
              )}
            />
          </div>
        </button>

        {expanded && (
          <div className="ml-6 mr-1 my-1 rounded-md border border-border/40 overflow-hidden text-[11px] animate-in fade-in slide-in-from-top-1 duration-150">
            {toolName === 'write_todos' &&
            typeof toolCall.input === 'object' &&
            Array.isArray(
              (toolCall.input as Record<string, unknown>)?.todos
            ) ? (
              <div className="p-2 bg-muted/10 space-y-2">
                {(
                  (toolCall.input as Record<string, unknown>).todos as Array<{
                    status: string;
                    content: string;
                  }>
                ).map((todo, idx: number) => (
                  <div key={idx} className="flex items-start gap-2">
                    <div className="mt-0.5 shrink-0">
                      {todo.status === 'completed' || todo.status === 'done' ? (
                        <Check size={12} className="text-emerald-500" />
                      ) : todo.status === 'in_progress' ? (
                        <Circle size={12} className="text-blue-500" />
                      ) : (
                        <Circle
                          size={12}
                          className="text-muted-foreground/40"
                        />
                      )}
                    </div>
                    <span
                      className={cn(
                        'text-[13px] text-foreground/90 leading-snug',
                        (todo.status === 'completed' ||
                          todo.status === 'done') &&
                          'line-through text-muted-foreground/60'
                      )}
                    >
                      {todo.content}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="font-mono">
                <div className="p-2.5 bg-muted/20">
                  <p className="text-[10px] font-medium text-muted-foreground/60 tracking-wider mb-1">
                    Input
                  </p>
                  <pre className="text-muted-foreground overflow-x-auto whitespace-pre-wrap text-[10px] max-h-32 overflow-y-auto">
                    {JSON.stringify(toolCall.input, null, 2)}
                  </pre>
                </div>
                {toolCall.output && (
                  <div className="p-2.5 border-t border-border/30">
                    <p className="text-[10px] font-medium text-muted-foreground/60 tracking-wider mb-1">
                      Output
                    </p>
                    <pre className="text-muted-foreground overflow-x-auto whitespace-pre-wrap text-[10px] max-h-32 overflow-y-auto">
                      {(() => {
                        try {
                          return JSON.stringify(
                            JSON.parse(toolCall.output),
                            null,
                            2
                          );
                        } catch {
                          return toolCall.output;
                        }
                      })()}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Pure thought — subtle italic line
  if (!thought) return null;
  return (
    <div className="flex items-start gap-2 px-1.5 py-0.5">
      <Brain size={10} className="text-muted-foreground/30 mt-0.5 shrink-0" />
      <p className="text-[12px] text-muted-foreground/50 italic leading-relaxed line-clamp-2">
        {thought}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grouped tool calls — a single collapsible section for consecutive steps
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Grouped display — used for legacy messages without timeline.
// ---------------------------------------------------------------------------

interface ReasoningDisplayProps {
  steps: ReasoningStep[];
  className?: string;
  defaultCollapsed?: boolean;
}

export function ReasoningDisplay({
  steps,
  className,
  defaultCollapsed = false,
}: ReasoningDisplayProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (steps.length === 0) return null;

  return (
    <div className={cn('mb-2', className)}>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40 uppercase tracking-widest mb-1 hover:text-muted-foreground/70 transition-colors"
      >
        <ChevronDown
          size={12}
          className={cn(
            'transition-transform duration-200',
            collapsed && '-rotate-90'
          )}
        />
        {steps.length} {steps.length === 1 ? 'step' : 'steps'}
      </button>

      {!collapsed && (
        <div>
          {steps.map((step, i) => (
            <StepItem key={i} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ReasoningBadge({
  toolName,
  status = 'running',
}: {
  toolName: string;
  status?: 'running' | 'done' | 'error';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded-full',
        status === 'running' &&
          'bg-blue-500/10 text-blue-600 dark:text-blue-400',
        status === 'done' &&
          'bg-green-500/10 text-green-600 dark:text-green-400',
        status === 'error' && 'bg-red-500/10 text-red-600 dark:text-red-400'
      )}
    >
      {status === 'running' && (
        <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
      )}
      {status === 'done' && '✓'}
      {status === 'error' && '✗'}
      {toolName}
    </span>
  );
}
