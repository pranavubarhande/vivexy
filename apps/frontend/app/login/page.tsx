'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_AUTH_ENABLED === 'false') {
      router.replace('/contact?interest=request-demo');
    }
  }, [router]);

  if (process.env.NEXT_PUBLIC_AUTH_ENABLED === 'false') return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-muted-foreground mt-2">
            Sign in to your account to continue
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
