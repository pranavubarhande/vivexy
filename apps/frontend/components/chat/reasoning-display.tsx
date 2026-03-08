'use client';

import { useState } from 'react';
import { cn } from '@/utils/common';
import { ChevronRight } from 'lucide-react';

interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  output: string;
}

interface ReasoningStep {
  thought: string;
  toolCalls?: ToolCall[];
}

interface ReasoningDisplayProps {
  steps: ReasoningStep[];
  className?: string;
  title?: string;
  /** When true the entire section starts collapsed (default false). */
  defaultCollapsed?: boolean;
}

export function ReasoningDisplay({
  steps,
  className,
  title = 'Thinking',
  defaultCollapsed = false,
}: ReasoningDisplayProps) {
  const [sectionOpen, setSectionOpen] = useState(!defaultCollapsed);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  if (steps.length === 0) return null;

  const toggleStep = (index: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className={cn('space-y-3 my-3', className)}>
      <button
        type="button"
        onClick={() => setSectionOpen((o) => !o)}
        className="flex items-center gap-2 text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5 hover:text-muted-foreground transition-colors"
      >
        <ChevronRight
          size={14}
          className={cn(
            'transition-transform duration-200',
            sectionOpen && 'rotate-90'
          )}
        />
        {title}
        <span className="text-[10px] normal-case tracking-normal font-normal">
          ({steps.length} {steps.length === 1 ? 'step' : 'steps'})
        </span>
      </button>

      {sectionOpen && (
        <div className="space-y-2 border-l-2 border-muted pl-4 ml-0.5">
          {steps.map((step, index) => {
            const isExpanded = expandedSteps.has(index);
            const toolCall = step.toolCalls?.[0];

            return (
              <div key={index} className="group transition-all duration-200">
                <button
                  onClick={() => toggleStep(index)}
                  className="w-full flex items-center gap-3 py-1 text-left hover:text-foreground transition-colors group"
                >
                  <div
                    className={cn(
                      'flex items-center justify-center w-5 h-5 rounded border border-muted-foreground/20 bg-muted/30 text-[10px] transition-colors',
                      isExpanded &&
                        'bg-primary/10 border-primary/30 text-primary'
                    )}
                  >
                    {toolCall ? 'λ' : 'τ'}
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    {toolCall ? (
                      <>
                        <span className="text-xs font-mono font-semibold text-primary/80">
                          {toolCall.tool}
                        </span>
                        <span className="text-xs text-muted-foreground truncate opacity-60 group-hover:opacity-100 transition-opacity">
                          {step.thought.split('\n')[0]}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground/80 leading-relaxed">
                        {step.thought}
                      </span>
                    )}
                  </div>
                  {toolCall?.output && (
                    <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-green-500/10 text-[10px] font-mono text-green-600 dark:text-green-400">
                      DONE
                    </div>
                  )}
                </button>

                {isExpanded && (
                  <div className="mt-2 mb-4 ml-8 space-y-3 animate-in fade-in slide-in-from-left-2 duration-200">
                    {/* Full Thought if it's long */}
                    {!toolCall && step.thought.includes('\n') && (
                      <div className="text-xs text-muted-foreground leading-relaxed bg-muted/20 p-3 rounded-lg border border-muted">
                        {step.thought}
                      </div>
                    )}

                    {toolCall && (
                      <div className="space-y-3">
                        {/* Input */}
                        <div className="rounded-lg border border-muted bg-black/5 dark:bg-white/5 overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-muted">
                            <span className="text-[10px] font-mono text-muted-foreground uppercase">
                              Parameters
                            </span>
                          </div>
                          <pre className="p-3 text-[11px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(toolCall.input, null, 2)}
                          </pre>
                        </div>

                        {/* Output */}
                        {toolCall.output && (
                          <div className="rounded-lg border border-muted bg-black/5 dark:bg-white/5 overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-muted">
                              <span className="text-[10px] font-mono text-muted-foreground uppercase">
                                Result
                              </span>
                            </div>
                            <pre className="p-3 text-[11px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto scrollbar-thin">
                              {(() => {
                                try {
                                  const parsed = JSON.parse(toolCall.output);
                                  return JSON.stringify(parsed, null, 2);
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
          })}
        </div>
      )}
    </div>
  );
}

// Compact inline version for showing during streaming
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
