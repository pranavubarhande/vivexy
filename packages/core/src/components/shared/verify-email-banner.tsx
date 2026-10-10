'use client';

import { useAuthSafe } from './auth-provider';
import { useResendVerification } from '../../hooks/useAuth';
import { Alert, AlertDescription } from '@vivexy/ui/alert';
import { Button } from '@vivexy/ui/button';
import { toast } from 'sonner';

export function VerifyEmailBanner() {
  const { user, isAuthenticated } = useAuthSafe();
  const resendMutation = useResendVerification();

  if (!isAuthenticated || !user || user.emailVerified) return null;

  const handleResend = async () => {
    try {
      await resendMutation.mutateAsync();
      toast.success('Verification email sent');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to resend email'
      );
    }
  };

  return (
    <Alert className="rounded-none border-x-0 border-t-0">
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>Please verify your email address to secure your account.</span>
        <Button
          size="sm"
          variant="outline"
          onClick={handleResend}
          disabled={resendMutation.isPending}
        >
          {resendMutation.isPending ? 'Sending...' : 'Resend email'}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
