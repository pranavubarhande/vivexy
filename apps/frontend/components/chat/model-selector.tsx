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

export function ModelSelector({
  models,
  isLoading,
  selectedModelId,
  onSelect,
  disabled,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Select first model by default if none selected
  useEffect(() => {
    if (!selectedModelId && models.length > 0) {
      const defaultModel = models[0];
      onSelect(
        defaultModel.id,
        defaultModel.provider,
        defaultModel.modelId,
        defaultModel.name
      );
    }
  }, [models, selectedModelId, onSelect]);

  const selectedModel = models.find((m) => m.id === selectedModelId);

  const groupedModels = models.reduce(
    (acc, model) => {
      if (!acc[model.provider]) {
        acc[model.provider] = [];
      }
      acc[model.provider].push(model);
      return acc;
    },
    {} as Record<string, LLMModel[]>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="gap-2 min-w-[140px] justify-between"
        >
          <span className="truncate">
            {selectedModel ? selectedModel.name : 'Select Model'}
          </span>
          <span className="text-xs opacity-50">▼</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Select Model</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            Object.entries(groupedModels).map(([provider, providerModels]) => (
              <div key={provider}>
                <h4 className="text-sm font-medium text-muted-foreground mb-2 capitalize">
                  {provider}
                </h4>
                <div className="grid gap-2">
                  {providerModels.map((model) => (
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
                        'flex items-center justify-between p-3 rounded-lg border text-sm transition-colors',
                        selectedModelId === model.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted'
                      )}
                    >
                      <span className="font-medium">{model.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(model.contextWindow / 1000)}k context
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
