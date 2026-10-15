'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Megaphone, Trash2 } from 'lucide-react';
import { Badge } from '@vivexy/ui/badge';
import { Button } from '@vivexy/ui/button';
import { Input } from '@vivexy/ui/input';
import { Switch } from '@vivexy/ui/switch';
import { Textarea } from '@vivexy/ui/textarea';
import { EmptyState } from '@vivexy/ui/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@vivexy/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@vivexy/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@vivexy/ui/select';
import {
  useAdminAnnouncements,
  useClients,
  useCreateAnnouncement,
  useDeleteAnnouncement,
  useUpdateAnnouncement,
} from '@vivexy/core/hooks/useSuperadmin';
import { formatDate, getApiErrorMessage } from '@vivexy/core/lib/admin-format';
import { ConfirmAction, TableSkeleton } from './admin-shared';

const ALL_CLIENTS = 'all';

const announcementSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  body: z.string().max(2000),
  level: z.enum(['info', 'warning', 'critical']),
  teamId: z.string(),
  endsAt: z.string(),
});

type AnnouncementFormData = z.infer<typeof announcementSchema>;

const LEVEL_VARIANTS = {
  info: 'secondary',
  warning: 'outline',
  critical: 'destructive',
} as const;

const AnnouncementForm = () => {
  const createAnnouncement = useCreateAnnouncement();
  const { data: clients } = useClients({ page: 1, pageSize: 100 });
  const form = useForm<AnnouncementFormData>({
    resolver: zodResolver(announcementSchema),
    defaultValues: {
      title: '',
      body: '',
      level: 'info',
      teamId: ALL_CLIENTS,
      endsAt: '',
    },
  });

  const onSubmit = async (data: AnnouncementFormData) => {
    try {
      await createAnnouncement.mutateAsync({
        title: data.title,
        body: data.body || null,
        level: data.level,
        teamId: data.teamId === ALL_CLIENTS ? null : data.teamId,
        endsAt: data.endsAt ? new Date(data.endsAt).toISOString() : null,
      });
      form.reset();
      toast.success('Announcement published');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to publish'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New announcement</CardTitle>
        <CardDescription>
          Shown as a banner at the top of the app.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Scheduled maintenance" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Details</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Level</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="warning">Warning</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="teamId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Audience</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={ALL_CLIENTS}>All users</SelectItem>
                        {clients?.items.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endsAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ends (optional)</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" disabled={createAnnouncement.isPending}>
              <Megaphone />
              Publish
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export const SuperadminAnnouncements = () => {
  const { data: announcements, isLoading } = useAdminAnnouncements();
  const updateAnnouncement = useUpdateAnnouncement();
  const deleteAnnouncement = useDeleteAnnouncement();

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
      <AnnouncementForm />
      <Card className="p-0">
        {isLoading ? (
          <TableSkeleton />
        ) : !announcements?.length ? (
          <EmptyState
            className="m-4"
            icon={<Megaphone />}
            title="No announcements"
            description="Publish one to show a banner to users."
          />
        ) : (
          <ul className="divide-y divide-border">
            {announcements.map((announcement) => (
              <li
                key={announcement.id}
                className="flex items-start justify-between gap-4 p-4"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{announcement.title}</span>
                    <Badge variant={LEVEL_VARIANTS[announcement.level]}>
                      {announcement.level}
                    </Badge>
                    {announcement.teamId && (
                      <Badge variant="muted">Single client</Badge>
                    )}
                  </div>
                  {announcement.body && (
                    <p className="text-sm text-muted-foreground">
                      {announcement.body}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Created {formatDate(announcement.createdAt)}
                    {announcement.endsAt &&
                      ` · ends ${formatDate(announcement.endsAt)}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch
                    checked={announcement.isActive}
                    aria-label="Active"
                    onCheckedChange={(isActive) =>
                      updateAnnouncement.mutate({
                        announcementId: announcement.id,
                        announcement: { isActive },
                      })
                    }
                  />
                  <ConfirmAction
                    destructive
                    title="Delete announcement?"
                    description={announcement.title}
                    confirmLabel="Delete"
                    onConfirm={() => deleteAnnouncement.mutate(announcement.id)}
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete"
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
