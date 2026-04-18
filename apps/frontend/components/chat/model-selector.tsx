'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Search,
  X,
  Zap,
  Wind,
  Flame,
  Bot,
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

const PROVIDER_META: Record<
  string,
  { label: string; icon: React.ReactNode; color: string }
> = {
  openai: {
    label: 'OpenAI',
    icon: <Sparkles size={12} />,
    color: 'text-emerald-500',
  },
  anthropic: {
    label: 'Anthropic',
    icon: <Brain size={12} />,
    color: 'text-orange-400',
  },
  google: {
    label: 'Google',
    icon: <Gem size={12} />,
    color: 'text-blue-400',
  },
  groq: {
    label: 'Groq',
    icon: <Zap size={12} />,
    color: 'text-yellow-400',
  },
  mistral: {
    label: 'Mistral',
    icon: <Wind size={12} />,
    color: 'text-violet-400',
  },
  together: {
    label: 'Together AI',
    icon: <Cpu size={12} />,
    color: 'text-sky-400',
  },
  fireworks: {
    label: 'Fireworks',
    icon: <Flame size={12} />,
    color: 'text-red-400',
  },
  cohere: {
    label: 'Cohere',
    icon: <Bot size={12} />,
    color: 'text-teal-400',
  },
  xai: {
    label: 'xAI',
    icon: <Sparkles size={12} />,
    color: 'text-slate-400',
  },
  ollama: {
    label: 'Ollama',
    icon: <Cpu size={12} />,
    color: 'text-lime-700',
  },
};

function getProviderMeta(provider: string) {
  return (
    PROVIDER_META[provider.toLowerCase()] ?? {
      label: provider,
      icon: <Cpu size={12} />,
      color: 'text-muted-foreground',
    }
  );
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
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedModelId && models.length > 0) {
      const d = models[0];
      onSelect(d.id, d.provider, d.modelId, d.name);
    }
  }, [models, selectedModelId, onSelect]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setTimeout(() => {
        setQuery('');
        searchRef.current?.focus();
      }, 0);
    }
  };

  const selectedModel = models.find((m) => m.id === selectedModelId);
  const selectedMeta = selectedModel
    ? getProviderMeta(selectedModel.provider)
    : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        m.modelId.toLowerCase().includes(q)
    );
  }, [models, query]);

  const grouped = useMemo(
    () =>
      filtered.reduce(
        (acc, model) => {
          if (!acc[model.provider]) acc[model.provider] = [];
          acc[model.provider].push(model);
          return acc;
        },
        {} as Record<string, LLMModel[]>
      ),
    [filtered]
  );

  const handleSelect = (model: LLMModel) => {
    onSelect(model.id, model.provider, model.modelId, model.name);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-7 gap-1.5 px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted max-w-[200px]"
        >
          {selectedMeta ? (
            <span className={selectedMeta.color}>{selectedMeta.icon}</span>
          ) : (
            <Cpu size={13} />
          )}
          <span className="truncate">
            {selectedModel?.name ?? 'Select Model'}
          </span>
          <ChevronDown size={12} className="opacity-40 shrink-0" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-[90vw] sm:max-w-[480px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border/50">
          <DialogTitle className="text-sm font-semibold">
            Select Model
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="px-3 py-2.5 border-b border-border/50">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models or providers…"
              className="pl-8 pr-8 h-8 text-[13px] bg-muted/40 border-transparent focus-visible:border-primary/30 focus-visible:bg-background"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Model list */}
        <div className="overflow-y-auto max-h-[55vh] py-2 px-2 no-scrollbar">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : Object.keys(grouped).length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">
              No models match &ldquo;{query}&rdquo;
            </p>
          ) : (
            Object.entries(grouped).map(([provider, providerModels]) => {
              const meta = getProviderMeta(provider);
              return (
                <div key={provider} className="mb-3 last:mb-0">
                  {/* Provider header */}
                  <div
                    className={cn(
                      'flex items-center gap-1.5 px-2 mb-1 text-[11px] font-semibold uppercase tracking-wider',
                      meta.color
                    )}
                  >
                    {meta.icon}
                    {meta.label}
                    <span className="ml-auto font-normal text-muted-foreground normal-case tracking-normal">
                      {providerModels.length}
                    </span>
                  </div>

                  {/* Models */}
                  <div className="grid gap-0.5">
                    {providerModels.map((model) => {
                      const isSelected = selectedModelId === model.id;
                      return (
                        <button
                          key={model.id}
                          onClick={() => handleSelect(model)}
                          className={cn(
                            'flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors',
                            isSelected
                              ? 'bg-primary/10 text-foreground'
                              : 'hover:bg-muted/70 text-foreground/80 hover:text-foreground'
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={cn(
                                'w-3.5 h-3.5 shrink-0 flex items-center justify-center rounded-full',
                                isSelected
                                  ? 'bg-primary text-primary-foreground'
                                  : ''
                              )}
                            >
                              {isSelected && <Check size={9} strokeWidth={3} />}
                            </div>
                            <span className="text-[13px] font-medium truncate">
                              {model.name}
                            </span>
                          </div>
                          <span className="text-[11px] text-muted-foreground shrink-0 ml-2 tabular-nums">
                            {formatContext(model.contextWindow)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border/50 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {filtered.length} of {models.length} models
          </span>
          {selectedModel && (
            <span className="text-[11px] text-muted-foreground">
              Selected:{' '}
              <span className="text-foreground font-medium">
                {selectedModel.name}
              </span>
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
