'use client';

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/common';
import { Bot, ChevronDown, Check } from 'lucide-react';

interface AgentSummary {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

interface AgentSelectorProps {
  agents: AgentSummary[];
  selectedAgentId: string;
  onSelect: (agentId: string) => void;
  disabled?: boolean;
}

export function AgentSelector({
  agents,
  selectedAgentId,
  onSelect,
  disabled = false,
}: AgentSelectorProps) {
  const [open, setOpen] = useState(false);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  const handleSelect = useCallback(
    (agentId: string) => {
      onSelect(agentId);
      setOpen(false);
    },
    [onSelect]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-7 gap-1.5 px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <span className="hidden sm:inline truncate max-w-[100px]">
            {selectedAgent?.name || 'Agent'}
          </span>
          <ChevronDown size={12} className="opacity-50 shrink-0" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot size={16} className="text-primary" />
            Select Agent
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          {agents.map((agent) => {
            const isSelected = selectedAgentId === agent.id;
            return (
              <button
                key={agent.id}
                onClick={() => handleSelect(agent.id)}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
                  'hover:border-primary/30 hover:bg-primary/5',
                  isSelected
                    ? 'border-primary/40 bg-primary/8 ring-1 ring-primary/20'
                    : 'border-border/60 bg-background'
                )}
              >
                <span
                  className="text-xl shrink-0 w-9 h-9 flex items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${agent.color}18` }}
                >
                  {agent.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{agent.name}</div>
                  <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {agent.description}
                  </div>
                </div>
                {isSelected && (
                  <Check size={15} className="text-primary shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
