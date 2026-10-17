'use client';

import { useState } from 'react';
import { useDeleteAccount } from '@vivexy/core/hooks/useUserSettings';
import { Button } from '@vivexy/ui/button';
import { Input } from '@vivexy/ui/input';
import { Label } from '@vivexy/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@vivexy/ui/alert-dialog';
import { toast } from 'sonner';
import { userService } from '@vivexy/core/services/user.service';
import {
  downloadBlob,
  getApiErrorMessage,
} from '@vivexy/core/lib/admin-format';

export function DangerZone() {
  const deleteAccount = useDeleteAccount();
  const [confirmText, setConfirmText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleDeleteAccount = async () => {
    if (confirmText !== 'DELETE') {
      toast.error("Please type 'DELETE' to confirm");
      return;
    }

    setIsLoading(true);
    try {
      await deleteAccount.mutateAsync();
      toast.success('Account deleted successfully');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete account'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const exportBlob = await userService.exportMyData();
      downloadBlob(exportBlob, 'my-vivexy-data.json');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to export your data'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
        <div className="space-y-1">
          <h4 className="text-sm font-medium">Download your data</h4>
          <p className="text-sm text-muted-foreground">
            Get a copy of your profile, teams, chats and usage as JSON.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          Download
        </Button>
      </div>
      <div className="rounded-lg border border-destructive/50 p-4">
        <div className="flex">
          <div className="space-y-1">
            <h4 className="text-sm font-medium">Delete Account</h4>
            <p className="text-sm text-muted-foreground">
              Permanently delete your account and all associated data. This
              action cannot be undone.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                Delete Account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete
                  your account and remove your data from our servers.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-4">
                <Label htmlFor="confirm-delete">
                  Type <strong>DELETE</strong> to confirm:
                </Label>
                <Input
                  id="confirm-delete"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="mt-2"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  disabled={confirmText !== 'DELETE' || isLoading}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isLoading ? 'Deleting...' : 'Delete Account'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
