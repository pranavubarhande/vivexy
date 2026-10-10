'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RegisterForm } from '@vivexy/core/auth/register-form';
import { AuthSplitLayout } from '@vivexy/core/auth/auth-split-layout';
import { APP_NAME } from '@/constants/project';

export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_AUTH_ENABLED === 'false') {
      router.replace('/contact?interest=request-demo');
    }
  }, [router]);

  if (process.env.NEXT_PUBLIC_AUTH_ENABLED === 'false') return null;

  return (
    <AuthSplitLayout appName={APP_NAME}>
      <RegisterForm />
    </AuthSplitLayout>
  );
}
