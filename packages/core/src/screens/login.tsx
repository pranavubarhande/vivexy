'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoginForm } from '@vivexy/core/auth/login-form';
import { AuthSplitLayout } from '@vivexy/core/auth/auth-split-layout';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_AUTH_ENABLED === 'false') {
      router.replace('/contact?interest=request-demo');
    }
  }, [router]);

  if (process.env.NEXT_PUBLIC_AUTH_ENABLED === 'false') return null;

  return (
    <AuthSplitLayout>
      <LoginForm />
    </AuthSplitLayout>
  );
}
