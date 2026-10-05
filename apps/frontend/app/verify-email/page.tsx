'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useVerifyEmail } from '@vivexy/core/hooks/useAuth';
import { Button } from '@vivexy/ui/button';
import Link from 'next/link';

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center space-y-4 max-w-md">
        {status === 'pending' && (
          <p className="text-muted-foreground">Verifying your email...</p>
        )}
        {status === 'success' && (
          <>
            <h1 className="text-xl font-bold">Email verified</h1>
            <p className="text-muted-foreground">
              Your email address has been verified.
            </p>
            <Link href="/chat">
              <Button>Continue</Button>
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="text-xl font-bold">Link expired</h1>
            <p className="text-muted-foreground">
              This verification link is invalid or has expired. You can request
              a new one from inside the app.
            </p>
            <Link href="/login">
              <Button variant="outline">Back to sign in</Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
          <div className="text-center space-y-4 max-w-md">
            <p className="text-muted-foreground">Verifying your email...</p>
          </div>
        </div>
      }
    >
      <VerifyEmailPageInner />
    </Suspense>
  );
}
