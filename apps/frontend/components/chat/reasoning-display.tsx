'use client';

import { useState } from 'react';
import { cn } from '@/utils/common';
import { ChevronDown, Terminal, Brain, Loader2 } from 'lucide-react';
import type { ReasoningStep } from '@/types/chat';

export type { ReasoningStep };

// ---------------------------------------------------------------------------
// Single step — no header/collapse wrapper. Used in timeline rendering.
// ---------------------------------------------------------------------------

interface StepItemProps {
  step: ReasoningStep;
  isStreaming?: boolean;
}

export function StepItem({ step, isStreaming }: StepItemProps) {
  const [expanded, setExpanded] = useState(false);
  const toolCall = step.toolCalls?.[0];
  const isDone = !!toolCall?.output;

  if (toolCall) {
    // Tool call row
    return (
      <div className="my-1">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-muted/40 transition-colors group"
        >
          <div
            className={cn(
              'w-5 h-5 rounded flex items-center justify-center shrink-0',
              isDone
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-blue-500/10 text-blue-500'
            )}
          >
            {!isDone && isStreaming ? (
              <Loader2 size={10} className="animate-spin" />
            ) : (
              <Terminal size={10} />
            )}
          </div>
          <span className="font-mono text-[11px] font-medium text-foreground/70 shrink-0">
            {toolCall.tool}
          </span>
          {step.thought && (
            <span className="text-[11px] text-muted-foreground/40 truncate">
              {step.thought.split('\n')[0]}
            </span>
          )}
          <span
            className={cn(
              'ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0',
              isDone
                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                : 'text-blue-500 bg-blue-500/10'
            )}
          >
            {isDone ? 'done' : 'running'}
          </span>
          <ChevronDown
            size={11}
            className={cn(
              'text-muted-foreground/30 shrink-0 transition-transform group-hover:text-muted-foreground/60',
              expanded && 'rotate-180'
            )}
          />
        </button>

        {expanded && (
          <div className="ml-7 mr-2 mb-1 mt-0.5 rounded-lg border border-border/60 overflow-hidden text-[11px] font-mono animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="bg-muted/30 px-3 py-1.5 border-b border-border/40">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {toolCall.tool}
              </span>
            </div>
            <div className="divide-y divide-border/40">
              <div className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                  Input
                </p>
                <pre className="text-muted-foreground overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(toolCall.input, null, 2)}
                </pre>
              </div>
              {toolCall.output && (
                <div className="p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                    Output
                  </p>
                  <pre className="text-muted-foreground overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
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
          </div>
        )}
      </div>
    );
  }

  // Pure thought — subtle italic line
  return (
    <div className="flex items-start gap-2 px-2 py-1 my-0.5">
      <Brain size={11} className="text-muted-foreground/30 mt-0.5 shrink-0" />
      <p className="text-[11px] text-muted-foreground/50 italic leading-relaxed line-clamp-2">
        {step.thought}
      </p>
    </div>
  );
}

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
