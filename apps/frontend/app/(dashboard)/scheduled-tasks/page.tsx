'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScheduledTaskList } from '@/components/scheduled-tasks/scheduled-task-list';
import { ScheduledTaskForm } from '@/components/scheduled-tasks/scheduled-task-form';
import { TaskRunHistory } from '@/components/scheduled-tasks/task-run-history';
import { scheduledTasksService } from '@/services/scheduled-tasks.service';
import type { ScheduledTask } from '@/types/scheduled-task';

const QUERY_KEY = ['scheduled-tasks'];

export default function ScheduledTasksPage() {
  const qc = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: scheduledTasksService.list,
    refetchInterval: 30_000, // keep next-run times and status fresh
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editTask, setEditTask] = useState<ScheduledTask | null>(null);
  const [historyTask, setHistoryTask] = useState<ScheduledTask | null>(null);

  const refresh = useCallback(
    () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
    [qc]
  );

  const handleEdit = (task: ScheduledTask) => {
    setEditTask(task);
    setFormOpen(true);
  };

  const handleNew = () => {
    setEditTask(null);
    setFormOpen(true);
  };

  const handleSaved = () => {
    refresh();
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="mx-auto w-full px-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Scheduled Tasks</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Run chat prompts automatically on a schedule. Results appear in
              your Chat history.
            </p>
          </div>
          <Button onClick={handleNew}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Task
          </Button>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-xl border border-border bg-muted/30 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <ScheduledTaskList
            tasks={tasks}
            onRefresh={refresh}
            onEdit={handleEdit}
            onViewRuns={setHistoryTask}
            onNew={handleNew}
          />
        )}
      </div>

      {/* Form dialog */}
      <ScheduledTaskForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditTask(null);
        }}
        onSaved={handleSaved}
        editTask={editTask}
      />

      {/* Run history sheet */}
      <TaskRunHistory task={historyTask} onClose={() => setHistoryTask(null)} />
    </div>
  );
}
