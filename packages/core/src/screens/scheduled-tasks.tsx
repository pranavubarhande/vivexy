'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@vivexy/ui/button';
import { PageContainer, PageHeader } from '@vivexy/ui/page-header';
import { ScheduledTaskList } from '@vivexy/core/scheduled-tasks/scheduled-task-list';
import { ScheduledTaskForm } from '@vivexy/core/scheduled-tasks/scheduled-task-form';
import { TaskRunHistory } from '@vivexy/core/scheduled-tasks/task-run-history';
import { scheduledTasksService } from '@vivexy/core/services/scheduled-tasks.service';
import type { ScheduledTask } from '@vivexy/core/types/scheduled-task';

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
    <PageContainer size="narrow" className="max-w-4xl">
      <PageHeader
        eyebrow="Automation"
        title="Scheduled tasks"
        description="Run chat prompts automatically on a schedule. Results appear in your chat history."
        actions={
          tasks.length > 0 && (
            <Button onClick={handleNew}>
              <Plus className="h-4 w-4" />
              New task
            </Button>
          )
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-2xl border border-border bg-muted/30 animate-pulse"
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
    </PageContainer>
  );
}
