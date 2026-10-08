'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useVerifyEmail } from '@vivexy/core/hooks/useAuth';
import { Button } from '@vivexy/ui/button';
import Link from 'next/link';
import { MailCheck, MailX } from 'lucide-react';
import { AuthStatus } from '@vivexy/core/auth/auth-status';

function VerifyEmailPageInner() {
  const searchParams = useSearchParams();
  const verifyMutation = useVerifyEmail();
  const hasRun = useRef(false);
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>(
    'pending'
  );

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      return;
    }

    verifyMutation.mutate(token, {
      onSuccess: () => setStatus('success'),
      onError: () => setStatus('error'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'success') {
    return (
      <AuthStatus
        icon={<MailCheck />}
        title="Email verified"
        description="Your email address has been verified. You're all set."
        action={
          <Button asChild>
            <Link href="/chat">Continue to workspace</Link>
          </Button>
        }
      />
    );
  }

  if (status === 'error') {
    return (
      <AuthStatus
        icon={<MailX />}
        title="Link expired"
        description="This verification link is invalid or has expired. You can request a new one from inside the app."
        action={
          <Button variant="outline" asChild>
            <Link href="/login">Back to sign in</Link>
          </Button>
        }
      />
    );
  }

  return <AuthStatus pending title="Verifying your email…" />;
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AuthStatus pending title="Verifying your email…" />}>
      <VerifyEmailPageInner />
    </Suspense>
  );
}
