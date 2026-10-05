'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useExchangeOAuthCode } from '@vivexy/core/hooks/useAuth';

function OAuthCallbackPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const exchangeMutation = useExchangeOAuthCode();
  // Next.js dev mode double-invokes effects (React StrictMode) — without
  // this guard, the exchange code (single-use on the backend) would get
  // consumed by the first invocation and the second would always fail.
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const code = searchParams.get('code');
    // Single-use, same as the exchange code itself: read once, clear
    // immediately. A missing nonce here means this page was reached
    // without going through handleSSOLogin's redirect (direct navigation,
    // or someone else's captured code/link) — the backend would reject
    // the exchange anyway, but failing fast here avoids a pointless
    // network round-trip and gives the same clear error path.
    const state = sessionStorage.getItem('oauth_state');
    sessionStorage.removeItem('oauth_state');

    if (!code || !state) {
      router.replace('/login?error=oauth_failed');
      return;
    }

    exchangeMutation.mutate(
      { code, state },
      {
        onSuccess: () => router.replace('/chat'),
        onError: () => router.replace('/login?error=oauth_failed'),
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">Signing you in...</p>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <p className="text-muted-foreground">Signing you in...</p>
        </div>
      }
    >
      <OAuthCallbackPageInner />
    </Suspense>
  );
}
