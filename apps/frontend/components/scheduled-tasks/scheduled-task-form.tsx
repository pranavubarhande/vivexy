'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@vivexy/ui/dialog';
import { Button } from '@vivexy/ui/button';
import { Input } from '@vivexy/ui/input';
import { Label } from '@vivexy/ui/label';
import { Textarea } from '@vivexy/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@vivexy/ui/tabs';
import { Switch } from '@vivexy/ui/switch';
import { ModelSelector } from '@/components/chat/model-selector';
import { FileUpload, UploadedFile } from '@/components/chat/file-upload';
import { useModels } from '@vivexy/core/hooks/useChat';
import { scheduledTasksService } from '@vivexy/core/services/scheduled-tasks.service';
import { chatService } from '@vivexy/core/services/chat.service';
import type {
  CreateScheduledTaskPayload,
  ScheduleType,
  ScheduledTask,
} from '@vivexy/core/types/scheduled-task';

// ---------------------------------------------------------------------------
// Time conversion helpers (all times in HH:MM format)
// ---------------------------------------------------------------------------

function tzName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    const off = -new Date().getTimezoneOffset();
    return `UTC${off >= 0 ? '+' : ''}${Math.floor(off / 60)
      .toString()
      .padStart(2, '0')}:${(Math.abs(off) % 60).toString().padStart(2, '0')}`;
  }
}

/** Local HH:MM → UTC HH:MM */
function localToUTC(hhmm: string): string {
  if (!hhmm || !hhmm.includes(':')) return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  const offset = new Date().getTimezoneOffset(); // minutes behind UTC
  let utc = (((h * 60 + m + offset) % 1440) + 1440) % 1440;
  return `${String(Math.floor(utc / 60)).padStart(2, '0')}:${String(utc % 60).padStart(2, '0')}`;
}

/** UTC HH:MM → local HH:MM */
function utcToLocal(hhmm: string): string {
  if (!hhmm || !hhmm.includes(':')) return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  const offset = new Date().getTimezoneOffset();
  let local = (((h * 60 + m - offset) % 1440) + 1440) % 1440;
  return `${String(Math.floor(local / 60)).padStart(2, '0')}:${String(local % 60).padStart(2, '0')}`;
}

/** datetime-local string → "17 May 2026, 22:13 UTC" */
function localDtToUTCLabel(localDt: string): string {
  if (!localDt) return '';
  const d = new Date(localDt);
  if (isNaN(d.getTime())) return '';
  return (
    d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    }) + ' UTC'
  );
}

// ---------------------------------------------------------------------------

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (task: ScheduledTask) => void;
  editTask?: ScheduledTask | null;
}

/** Small pill showing a time in the other timezone */
function TZPill({ label }: { label: string }) {
  if (!label) return null;
  return (
    <span className="inline-flex items-center text-[11px] text-muted-foreground bg-muted rounded-md px-2 py-0.5">
      {label}
    </span>
  );
}

export function ScheduledTaskForm({ open, onClose, onSaved, editTask }: Props) {
  const { models, isLoading: isLoadingModels } = useModels();

  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [scheduleType, setScheduleType] = useState<ScheduleType>('once');
  // "once" — datetime-local value (local time, browser picks it up correctly)
  const [scheduledAt, setScheduledAt] = useState('');
  // "daily" / "weekly" — stored in LOCAL time in this state; converted to UTC on save
  const [localRunTime, setLocalRunTime] = useState('09:00');
  const [runDays, setRunDays] = useState<number[]>([0]);
  const [cronExpression, setCronExpression] = useState('0 9 * * 1');
  const [isActive, setIsActive] = useState(true);

  const [selectedModelDbId, setSelectedModelDbId] = useState<string | null>(
    null
  );
  const [selectedModelApiId, setSelectedModelApiId] = useState<string | null>(
    null
  );
  const [selectedModelProvider, setSelectedModelProvider] = useState('');
  const [selectedModelName, setSelectedModelName] = useState('');

  const [uploadChatId, setUploadChatId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [showUploader, setShowUploader] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Derived: what UTC time does the local time correspond to?
  const utcRunTime = localToUTC(localRunTime);

  // Pre-populate when editing — stored runTime is UTC so convert to local for display
  useEffect(() => {
    if (!open) return;
    if (editTask) {
      setName(editTask.name);
      setPrompt(editTask.prompt);
      setScheduleType(editTask.scheduleType);
      // scheduledAt is UTC ISO, convert to datetime-local format (local time)
      if (editTask.scheduledAt) {
        const d = new Date(editTask.scheduledAt);
        const pad = (n: number) => String(n).padStart(2, '0');
        setScheduledAt(
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
        );
      } else {
        setScheduledAt('');
      }
      // Stored runTime is UTC → convert to local for the input
      setLocalRunTime(utcToLocal(editTask.runTime ?? '09:00'));
      setRunDays(editTask.runDays ?? [0]);
      setCronExpression(editTask.cronExpression ?? '0 9 * * 1');
      setIsActive(editTask.isActive);
      setSelectedModelDbId(editTask.modelDbId);
      setSelectedModelApiId(editTask.modelApiId);
      setSelectedModelProvider(editTask.modelProvider ?? '');
      setSelectedModelName(editTask.modelName ?? '');
      setUploadedFiles([]);
    } else {
      resetForm();
    }
  }, [open, editTask]);

  const ensureUploadChat = async (): Promise<string> => {
    if (uploadChatId) return uploadChatId;
    const chat = await chatService.createChat(
      'assistant',
      '[Scheduled Task Files]'
    );
    setUploadChatId(chat.id);
    return chat.id;
  };

  const resetForm = () => {
    setName('');
    setPrompt('');
    setScheduleType('once');
    setScheduledAt('');
    setLocalRunTime('09:00');
    setRunDays([0]);
    setCronExpression('0 9 * * 1');
    setIsActive(true);
    setSelectedModelDbId(null);
    setSelectedModelApiId(null);
    setSelectedModelProvider('');
    setSelectedModelName('');
    setUploadChatId(null);
    setUploadedFiles([]);
    setShowUploader(false);
  };

  const toggleDay = (day: number) => {
    setRunDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const handleModelSelect = (
    dbId: string,
    provider: string,
    modelId: string,
    modelName: string
  ) => {
    setSelectedModelDbId(dbId);
    setSelectedModelApiId(modelId);
    setSelectedModelProvider(provider);
    setSelectedModelName(modelName);
  };

  const handleSave = async () => {
    if (!name.trim()) return toast.error('Name is required');
    if (!prompt.trim()) return toast.error('Prompt is required');
    if (scheduleType === 'once' && !scheduledAt)
      return toast.error('Scheduled date/time is required');
    if (scheduleType === 'weekly' && runDays.length === 0)
      return toast.error('Select at least one weekday');

    setIsSaving(true);
    try {
      const payload: CreateScheduledTaskPayload = {
        name: name.trim(),
        prompt: prompt.trim(),
        scheduleType,
        // scheduledAt: datetime-local is already local → toISOString() converts to UTC
        scheduledAt:
          scheduleType === 'once' ? new Date(scheduledAt).toISOString() : null,
        // runTime: convert local → UTC before storing
        runTime:
          scheduleType !== 'once' && scheduleType !== 'cron'
            ? utcRunTime
            : null,
        runDays: scheduleType === 'weekly' ? runDays : null,
        cronExpression: scheduleType === 'cron' ? cronExpression.trim() : null,
        agentId: 'assistant',
        modelDbId: selectedModelDbId,
        modelApiId: selectedModelApiId,
        modelProvider: selectedModelProvider || 'google',
        modelName: selectedModelName,
        fileIds: uploadedFiles.map((f) => f.id),
        isActive,
      };

      const saved = editTask
        ? await scheduledTasksService.update(editTask.id, payload)
        : await scheduledTasksService.create(payload);

      toast.success(editTask ? 'Task updated' : 'Task scheduled');
      onSaved(saved);
      onClose();
      resetForm();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save task');
    } finally {
      setIsSaving(false);
    }
  };

  const tz = tzName();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editTask ? 'Edit Scheduled Task' : 'New Scheduled Task'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Task Name</Label>
            <Input
              placeholder="e.g. Weekly portfolio review"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Prompt */}
          <div className="space-y-1.5">
            <Label>Prompt</Label>
            <Textarea
              placeholder="What should the agent do? You can reference your connected data sources, files, or ask for any analysis."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <Label>Schedule</Label>
            <Tabs
              value={scheduleType}
              onValueChange={(v) => setScheduleType(v as ScheduleType)}
            >
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="once">Once</TabsTrigger>
                <TabsTrigger value="daily">Daily</TabsTrigger>
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
                <TabsTrigger value="cron">Cron</TabsTrigger>
              </TabsList>

              {/* ── Once ── */}
              <TabsContent value="once" className="pt-3 space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Date & time —{' '}
                  <span className="font-medium text-foreground">{tz}</span>
                </Label>
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
                {scheduledAt && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>=</span>
                    <TZPill label={localDtToUTCLabel(scheduledAt)} />
                  </div>
                )}
              </TabsContent>

              {/* ── Daily ── */}
              <TabsContent value="daily" className="pt-3 space-y-3">
                <Label className="text-xs text-muted-foreground">
                  Run every day at —{' '}
                  <span className="font-medium text-foreground">{tz}</span>
                </Label>
                <div className="flex items-center gap-3 flex-wrap">
                  <Input
                    type="time"
                    value={localRunTime}
                    onChange={(e) => setLocalRunTime(e.target.value)}
                    className="w-32"
                  />
                  {localRunTime && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>=</span>
                      <TZPill label={`${utcRunTime} UTC`} />
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* ── Weekly ── */}
              <TabsContent value="weekly" className="pt-3 space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Days</Label>
                  <div className="flex gap-1.5 flex-wrap">
                    {WEEKDAYS.map((day, i) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(i)}
                        className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                          runDays.includes(i)
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-border text-muted-foreground hover:border-primary/50'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Time —{' '}
                    <span className="font-medium text-foreground">{tz}</span>
                  </Label>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Input
                      type="time"
                      value={localRunTime}
                      onChange={(e) => setLocalRunTime(e.target.value)}
                      className="w-32"
                    />
                    {localRunTime && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>=</span>
                        <TZPill label={`${utcRunTime} UTC`} />
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* ── Cron ── */}
              <TabsContent value="cron" className="pt-3 space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Cron expression (UTC) — minute hour dom month dow
                </Label>
                <Input
                  placeholder="0 9 * * 1"
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Example: <code className="font-mono">0 9 * * 1</code> = every
                  Monday 09:00 UTC. Requires{' '}
                  <code className="font-mono">croniter</code> on the server.
                </p>
              </TabsContent>
            </Tabs>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <Label>Model</Label>
            <ModelSelector
              models={models}
              isLoading={isLoadingModels}
              selectedModelId={selectedModelDbId}
              onSelect={handleModelSelect}
            />
            {!selectedModelDbId && (
              <p className="text-xs text-muted-foreground">
                No model selected — will use the system default.
              </p>
            )}
          </div>

          {/* Files */}
          <div className="space-y-2">
            <Label>Attach Files</Label>
            <p className="text-xs text-muted-foreground">
              Files uploaded here will be included in every run of this task.
            </p>

            {uploadedFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {uploadedFiles.map((f) => (
                  <span
                    key={f.id}
                    className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-full"
                  >
                    📎 {f.filename}
                    <button
                      type="button"
                      onClick={() =>
                        setUploadedFiles((prev) =>
                          prev.filter((u) => u.id !== f.id)
                        )
                      }
                      className="ml-1 text-muted-foreground hover:text-foreground leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {editTask &&
              editTask.fileIds.length > 0 &&
              uploadedFiles.length === 0 &&
              !showUploader && (
                <p className="text-xs text-muted-foreground">
                  {editTask.fileIds.length} file(s) already attached.
                </p>
              )}

            {showUploader ? (
              <FileUpload
                onFilesSelected={() => undefined}
                onFilesUploaded={(files) => {
                  setUploadedFiles((prev) => {
                    const existingIds = new Set(prev.map((f) => f.id));
                    const existingNames = new Set(prev.map((f) => f.filename));
                    const deduped = files.filter(
                      (f) =>
                        !existingIds.has(f.id) && !existingNames.has(f.filename)
                    );
                    return [...prev, ...deduped];
                  });
                  setShowUploader(false);
                }}
                chatId={uploadChatId ?? undefined}
                disabled={isSaving}
              />
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await ensureUploadChat();
                    setShowUploader(true);
                  } catch {
                    toast.error('Could not prepare file upload');
                  }
                }}
                className="text-xs"
              >
                + Attach files
              </Button>
            )}
          </div>

          {/* Skills note */}
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Skills:</span> Your
            currently enabled skills (configured in Settings → Extensions) will
            be automatically included in every run.
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <Switch
              id="is-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <Label htmlFor="is-active" className="cursor-pointer">
              {isActive ? 'Active — will run on schedule' : 'Inactive — paused'}
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : editTask ? 'Update Task' : 'Schedule Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
