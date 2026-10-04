'use client';

import { useState } from 'react';
import { Button } from '@vivexy/ui/button';
import { Input } from '@vivexy/ui/input';
import { Label } from '@vivexy/ui/label';
import { Badge } from '@vivexy/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@vivexy/ui/alert-dialog';
import { Key, Trash2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import {
  useApiKeys,
  useSetApiKey,
  useDeleteApiKey,
} from '@/hooks/useUserSettings';

const PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPT-4o, o1, o3-mini and more',
    placeholder: 'sk-...',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    description: 'Claude 3.5, 3.7 Sonnet and Opus',
    placeholder: 'sk-ant-...',
  },
  {
    id: 'google',
    label: 'Google AI',
    description: 'Gemini 2.5 Pro, Flash and more',
    placeholder: 'AIza...',
  },
  {
    id: 'groq',
    label: 'Groq',
    description: 'Llama, Gemma, DeepSeek (ultra-fast)',
    placeholder: 'gsk_...',
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    description: 'Mistral Large, Small, Codestral',
    placeholder: 'Enter API key',
  },
  {
    id: 'together',
    label: 'Together AI',
    description: 'Llama, DeepSeek, Qwen and more',
    placeholder: 'Enter API key',
  },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    description: 'Fast inference for open-source models',
    placeholder: 'fw_...',
  },
  {
    id: 'cohere',
    label: 'Cohere',
    description: 'Command R+ and Command models',
    placeholder: 'Enter API key',
  },
  {
    id: 'xai',
    label: 'xAI',
    description: 'Grok 3, Grok 2 and more',
    placeholder: 'xai-...',
  },
  {
    id: 'ollama',
    label: 'Ollama (Local)',
    description: 'Run models locally — no key needed',
    placeholder: 'No API key required',
    noKey: true,
  },
];

const ProviderRow = ({
  provider,
  hasKey,
  onSave,
  onDelete,
}: {
  provider: (typeof PROVIDERS)[number];
  hasKey: boolean;
  onSave: (apiKey: string) => void;
  onDelete: () => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = () => {
    if (!value.trim()) return;
    onSave(value.trim());
    setValue('');
    setEditing(false);
  };

  const handleCancel = () => {
    setValue('');
    setEditing(false);
  };

  if (provider.noKey) {
    return (
      <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{provider.label}</span>
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              Local
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {provider.description}
          </p>
        </div>
        <Badge variant="outline" className="text-[11px] text-muted-foreground">
          No key needed
        </Badge>
      </div>
    );
  }

  return (
    <>
      <div className="py-3 border-b border-border/50 last:border-0">
        <div className="flex items-center justify-between mb-2">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{provider.label}</span>
              {hasKey && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-4 px-1.5 border-green-500/50 text-green-600 dark:text-green-400"
                >
                  <CheckCircle2 size={9} className="mr-0.5" />
                  Configured
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {provider.description}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasKey && !editing && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={13} className="mr-1" />
                Remove
              </Button>
            )}
            {!editing && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setEditing(true)}
              >
                <Key size={12} className="mr-1" />
                {hasKey ? 'Update' : 'Add key'}
              </Button>
            )}
          </div>
        </div>

        {editing && (
          <div className="flex gap-2 mt-2">
            <div className="relative flex-1">
              <Input
                type={showValue ? 'text' : 'password'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={provider.placeholder}
                className="h-8 text-sm pr-8"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') handleCancel();
                }}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowValue((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showValue ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={handleSave}
              disabled={!value.trim()}
            >
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={handleCancel}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {provider.label} API key?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Models from {provider.label} will fall back to the server
              environment key if one is configured, or stop working if none
              exists.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                onDelete();
                setConfirmDelete(false);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const ApiKeysSettings = () => {
  const { data: apiKeys = [], isLoading } = useApiKeys();
  const setApiKey = useSetApiKey();
  const deleteApiKey = useDeleteApiKey();

  const keyMap = new Map(apiKeys.map((k) => [k.provider, k]));

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground mb-4">
        Add your own API keys to use models from any provider. Your keys are
        encrypted at rest and take priority over any server-configured keys.
      </p>
      <div>
        {PROVIDERS.map((provider) => (
          <ProviderRow
            key={provider.id}
            provider={provider}
            hasKey={keyMap.has(provider.id)}
            onSave={(apiKey) =>
              setApiKey.mutate({ provider: provider.id, apiKey })
            }
            onDelete={() => deleteApiKey.mutate(provider.id)}
          />
        ))}
      </div>
    </div>
  );
};
