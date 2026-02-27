'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/utils/common';
import { LLMModel } from '@/services/chat.service';
import {
  Sparkles,
  Brain,
  Gem,
  Cpu,
  ChevronDown,
  Check,
  Zap,
} from 'lucide-react';

interface ModelSelectorProps {
  models: LLMModel[];
  isLoading: boolean;
  selectedModelId: string | null;
  onSelect: (
    dbId: string,
    provider: string,
    modelId: string,
    modelName: string
  ) => void;
  disabled?: boolean;
}

/** Map provider name → lucide icon */
function ProviderIcon({ provider }: { provider: string }) {
  const p = provider.toLowerCase();
  if (p.includes('openai')) return <Sparkles size={13} className="shrink-0" />;
  if (p.includes('anthropic')) return <Brain size={13} className="shrink-0" />;
  if (p.includes('google') || p.includes('gemini'))
    return <Gem size={13} className="shrink-0" />;
  return <Cpu size={13} className="shrink-0" />;
}

function formatContext(ctx: number) {
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1)}M`;
  if (ctx >= 1000) return `${Math.round(ctx / 1000)}k`;
  return String(ctx);
}

export function ModelSelector({
  models,
  isLoading,
  selectedModelId,
  onSelect,
  disabled,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Select first model by default
  useEffect(() => {
    if (!selectedModelId && models.length > 0) {
      const d = models[0];
      onSelect(d.id, d.provider, d.modelId, d.name);
    }
  }, [models, selectedModelId, onSelect]);

  const selectedModel = models.find((m) => m.id === selectedModelId);

  const groupedModels = models.reduce(
    (acc, model) => {
      if (!acc[model.provider]) acc[model.provider] = [];
      acc[model.provider].push(model);
      return acc;
    },
    {} as Record<string, LLMModel[]>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-7 gap-1.5 px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted max-w-[180px]"
        >
          {selectedModel ? (
            <ProviderIcon provider={selectedModel.provider} />
          ) : (
            <Cpu size={13} />
          )}
          <span className="truncate">
            {selectedModel ? selectedModel.name : 'Select Model'}
          </span>
          <ChevronDown size={12} className="opacity-50 shrink-0" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap size={16} className="text-primary" />
            Select Model
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary" />
            </div>
          ) : (
            Object.entries(groupedModels).map(([provider, providerModels]) => (
              <div key={provider}>
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2 px-1 capitalize">
                  <ProviderIcon provider={provider} />
                  {provider}
                </div>
                <div className="grid gap-1.5">
                  {providerModels.map((model) => {
                    const isSelected = selectedModelId === model.id;
                    return (
                      <button
                        key={model.id}
                        onClick={() => {
                          onSelect(
                            model.id,
                            model.provider,
                            model.modelId,
                            model.name
                          );
                          setIsOpen(false);
                        }}
                        className={cn(
                          'flex items-center justify-between p-3 rounded-xl border text-sm transition-all text-left',
                          isSelected
                            ? 'border-primary/40 bg-primary/8 ring-1 ring-primary/20'
                            : 'border-border/60 hover:border-primary/20 hover:bg-muted/60'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {isSelected && (
                            <Check
                              size={13}
                              className="text-primary shrink-0"
                            />
                          )}
                          {!isSelected && (
                            <div className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span className="font-medium text-[13px]">
                            {model.name}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {formatContext(model.contextWindow)} ctx
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
