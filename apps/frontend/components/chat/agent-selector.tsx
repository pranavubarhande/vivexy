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
          variant="outline"
          size="sm"
          disabled={disabled}
          className="gap-2"
        >
          <span>{selectedAgent?.icon || '🤖'}</span>
          <span className="hidden sm:inline">
            {selectedAgent?.name || 'Select Agent'}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select Agent</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-4">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => handleSelect(agent.id)}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border text-left transition-all',
                'hover:bg-accent hover:border-accent-foreground/20',
                selectedAgentId === agent.id &&
                  'bg-accent border-primary ring-1 ring-primary'
              )}
            >
              <span
                className="text-2xl shrink-0 w-10 h-10 flex items-center justify-center rounded-lg"
                style={{ backgroundColor: `${agent.color}20` }}
              >
                {agent.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{agent.name}</div>
                <div className="text-sm text-muted-foreground line-clamp-2">
                  {agent.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
