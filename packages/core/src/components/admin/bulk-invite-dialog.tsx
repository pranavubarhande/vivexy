'use client';

import { ChangeEvent, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Upload, Users } from 'lucide-react';
import { Button } from '@vivexy/ui/button';
import { Textarea } from '@vivexy/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@vivexy/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
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
import { useBulkInvite } from '@vivexy/core/hooks/useAdmin';
import { BulkInviteResult } from '@vivexy/core/types/admin';
import {
  extractEmails,
  getApiErrorMessage,
} from '@vivexy/core/lib/admin-format';

const bulkInviteSchema = z.object({
  emailsText: z
    .string()
    .refine((text) => extractEmails(text).length > 0, 'Add at least one email'),
  role: z.enum(['ADMIN', 'MEMBER']),
});

type BulkInviteFormData = z.infer<typeof bulkInviteSchema>;

export const BulkInviteDialog = ({ teamId }: { teamId: string }) => {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<BulkInviteResult | null>(null);
  const bulkInvite = useBulkInvite();
  const form = useForm<BulkInviteFormData>({
    resolver: zodResolver(bulkInviteSchema),
    defaultValues: { emailsText: '', role: 'MEMBER' },
  });
  const emailCount = extractEmails(form.watch('emailsText')).length;

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    form.setValue('emailsText', extractEmails(text).join('\n'), {
      shouldValidate: true,
    });
    event.target.value = '';
  };

  const onSubmit = async (data: BulkInviteFormData) => {
    try {
      const inviteResult = await bulkInvite.mutateAsync({
        teamId,
        emails: extractEmails(data.emailsText),
        role: data.role,
      });
      setResult(inviteResult);
      toast.success(
        `${inviteResult.added.length} added, ${inviteResult.invited.length} invited`
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Bulk invite failed'));
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setResult(null);
      form.reset();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Users />
          Bulk invite
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk invite</DialogTitle>
          <DialogDescription>
            Paste emails or upload a CSV. Existing users are added right away;
            everyone else gets an email invite.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-3 text-sm">
            <p>
              <strong>{result.added.length}</strong> added ·{' '}
              <strong>{result.invited.length}</strong> invited ·{' '}
              <strong>{result.skipped.length}</strong> skipped
            </p>
            {result.skipped.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border p-3 text-xs">
                {result.skipped.map((skipped) => (
                  <li key={skipped.email}>
                    <span className="font-medium">{skipped.email}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      — {skipped.reason}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="emailsText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Emails</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={6}
                        placeholder={'ana@company.com\nben@company.com'}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {emailCount} email{emailCount === 1 ? '' : 's'} detected
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex flex-wrap items-end gap-3">
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="MEMBER">Member</SelectItem>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <Button type="button" variant="outline" asChild>
                  <label className="cursor-pointer">
                    <Upload />
                    Upload CSV
                    <input
                      type="file"
                      accept=".csv,.txt"
                      className="sr-only"
                      onChange={handleFile}
                    />
                  </label>
                </Button>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={bulkInvite.isPending}>
                  Invite {emailCount || ''}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
};
