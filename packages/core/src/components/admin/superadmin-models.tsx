'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Cpu } from 'lucide-react';
import { Card } from '@vivexy/ui/card';
import { Input } from '@vivexy/ui/input';
import { Switch } from '@vivexy/ui/switch';
import { EmptyState } from '@vivexy/ui/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@vivexy/ui/table';
import {
  useAdminModels,
  useUpdateModel,
} from '@vivexy/core/hooks/useSuperadmin';
import { AdminLLMModel } from '@vivexy/core/types/admin';
import { formatCost, getApiErrorMessage } from '@vivexy/core/lib/admin-format';
import { TableSkeleton } from './admin-shared';
import { usePlatformAccess } from './platform-access';

const PriceInput = ({
  value,
  onSave,
  label,
  disabled,
}: {
  value: number | null;
  onSave: (value: number | null) => void;
  label: string;
  disabled?: boolean;
}) => {
  const [draft, setDraft] = useState(value?.toString() ?? '');

  const commit = () => {
    const trimmed = draft.trim();
    const nextValue = trimmed === '' ? null : Number(trimmed);
    if (nextValue !== null && (isNaN(nextValue) || nextValue < 0)) {
      toast.error('Price must be a positive number');
      setDraft(value?.toString() ?? '');
      return;
    }
    if (nextValue !== value) onSave(nextValue);
  };

  return (
    <Input
      aria-label={label}
      disabled={disabled}
      value={draft}
      inputMode="decimal"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
      className="h-8 w-24 text-right tabular-nums"
    />
  );
};

export const SuperadminModels = () => {
  const { data: models, isLoading } = useAdminModels();
  const { canManage } = usePlatformAccess();
  const updateModel = useUpdateModel();

  const save = async (model: AdminLLMModel, update: Partial<AdminLLMModel>) => {
    try {
      await updateModel.mutateAsync({ modelId: model.id, update });
      toast.success(`${model.name} updated`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to update model'));
    }
  };

  if (isLoading) return <TableSkeleton rows={6} />;
  if (!models?.length) {
    return (
      <EmptyState
        icon={<Cpu />}
        title="No models configured"
        description="Seed models with scripts/seed_llm_models.py."
      />
    );
  }

  return (
    <Card className="p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead className="text-right">Input $/1M</TableHead>
              <TableHead className="text-right">Output $/1M</TableHead>
              <TableHead className="text-right">Messages (30d)</TableHead>
              <TableHead className="text-right">Spend (30d)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((model) => (
              <TableRow key={model.id}>
                <TableCell>
                  <div className="font-medium">{model.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {model.provider} · {model.modelId}
                  </div>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={model.isActive}
                    disabled={!canManage}
                    aria-label={`Enable ${model.name}`}
                    onCheckedChange={(isActive) => save(model, { isActive })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end">
                    <PriceInput
                      disabled={!canManage}
                      label={`${model.name} input price`}
                      value={model.inputCost}
                      onSave={(inputCost) => save(model, { inputCost })}
                    />
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end">
                    <PriceInput
                      disabled={!canManage}
                      label={`${model.name} output price`}
                      value={model.outputCost}
                      onSave={(outputCost) => save(model, { outputCost })}
                    />
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {model.usage.messageCount.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatCost(model.usage.totalCostUsd)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
        Disabled models disappear from every model picker. Price changes apply
        to new usage only.
      </p>
    </Card>
  );
};
