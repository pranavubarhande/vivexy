import { redirect } from 'next/navigation';
import { RegisterForm } from '@/components/auth/register-form';

export default function RegisterPage() {
  if (process.env.NEXT_PUBLIC_AUTH_ENABLED === 'false') {
    redirect('/contact?interest=request-demo');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Create an account</h1>
          <p className="text-muted-foreground mt-2">
            Sign up to get started with your new account
          </p>
        </div>
        <RegisterForm />
      </div>
    </div>
  );
}
