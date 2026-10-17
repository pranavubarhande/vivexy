export type ScheduleType = 'once' | 'daily' | 'weekly' | 'cron';
export type RunStatus = 'running' | 'completed' | 'failed';

export interface ScheduledTask {
  id: string;
  userId: string;
  teamId: string | null; // team billed for runs; null = personal
  name: string;
  prompt: string;
  scheduleType: ScheduleType;
  scheduledAt: string | null; // ISO UTC — one-time only
  runTime: string | null; // "HH:MM" UTC for daily / weekly
  runDays: number[] | null; // weekday numbers Mon=0 for weekly
  cronExpression: string | null;
  timezone: string;
  agentId: string | null;
  modelDbId: string | null;
  modelApiId: string | null;
  modelProvider: string | null;
  modelName: string | null;
  fileIds: string[];
  githubContext: Record<string, unknown> | null;
  isActive: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  runs?: ScheduledTaskRun[];
}

export interface ScheduledTaskRun {
  id: string;
  taskId: string;
  chatId: string | null;
  status: RunStatus;
  error: string | null;
  ranAt: string;
  completedAt: string | null;
}

export interface CreateScheduledTaskPayload {
  teamId?: string | null;
  name: string;
  prompt: string;
  scheduleType: ScheduleType;
  scheduledAt?: string | null;
  runTime?: string | null;
  runDays?: number[] | null;
  cronExpression?: string | null;
  timezone?: string;
  agentId?: string | null;
  modelDbId?: string | null;
  modelApiId?: string | null;
  modelProvider?: string | null;
  modelName?: string | null;
  fileIds?: string[];
  githubContext?: Record<string, unknown> | null;
  isActive?: boolean;
}

export type UpdateScheduledTaskPayload = Partial<CreateScheduledTaskPayload>;
