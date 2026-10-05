# Login/Register Pages Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign vivexy's login and register pages into a split-screen layout (brand panel + form) with real Google/Microsoft SSO icons, fixing a duplicate-heading bug and working cleanly on phone-sized screens.

**Architecture:** A new shared `AuthSplitLayout` component wraps both pages, rendering a two-column grid on desktop (dark olive brand panel + form) that collapses to a slim logo bar below the `md` breakpoint on mobile. `login-form.tsx`/`register-form.tsx` drop their `Card` wrapper (redundant once the split layout's right panel already separates the form visually) and gain real inline-SVG SSO icons.

**Tech Stack:** Next.js App Router, Tailwind (brand tokens from `packages/ui/theme.css`: cream `#FFFCEB` background, olive `#5E6738` primary scale, `font-serif` → Fraunces), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-05-auth-pages-redesign-design.md`

---

## Task 1: SSO icon components

**Files:**
- Create: `packages/core/src/components/auth/sso-icons.tsx`

- [x] **Step 1: Implement**

Create `packages/core/src/components/auth/sso-icons.tsx`:

```tsx
export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.3 29.3 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.4-.1-2.7-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 7.1 29.5 5 24 5c-7.7 0-14.3 4.4-17.7 10.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 45c5.4 0 10.3-2 14-5.3l-6.5-5.4C29.4 35.9 26.8 37 24 37c-5.3 0-9.7-3.4-11.3-8.1l-6.6 5.1C9.6 40.6 16.2 45 24 45z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H24v8h11.3c-.8 2.2-2.2 4.1-4 5.4l6.5 5.4C41.6 36 44 30.6 44 24c0-1.4-.1-2.7-.4-3.5z"
      />
    </svg>
  );
}

export function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 23 23" aria-hidden="true">
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" />
      <path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  );
}
```

`aria-hidden="true"` keeps these out of the accessible name computation for
whatever button wraps them — `getByRole('button', {name: /continue with
google/i})` in the existing tests still matches on the text content alone.

No test file for this component: it's pure presentational SVG markup with
no logic branches, consistent with how this codebase doesn't write
dedicated tests for icon components elsewhere (e.g. the `lucide-react`
icons already used throughout `login-form.tsx`/`register-form.tsx` aren't
tested either).

- [x] **Step 2: Typecheck**

Run: `cd packages/core && npx tsc --noEmit`
Expected: no errors.

- [x] **Step 3: Commit**

```bash
git add packages/core/src/components/auth/sso-icons.tsx
git commit -m "feat: add real Google/Microsoft SVG icons for SSO buttons"
```

---

## Task 2: AuthSplitLayout component

**Files:**
- Create: `packages/core/src/components/auth/auth-split-layout.tsx`
- Test: `packages/core/src/components/auth/__tests__/auth-split-layout.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/components/auth/__tests__/auth-split-layout.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AuthSplitLayout } from '../auth-split-layout';

// This test file is the first in this codebase to render a component
// that uses next/image. There's no existing precedent/mock for it in
// vitest.setup.ts (confirmed: packages/core/vitest.setup.ts only sets up
// jest-dom), and this is a plain Vite/jsdom environment, not Next's own
// test runtime, so next/image's real implementation isn't guaranteed to
// render cleanly here. Mock it to a plain <img> to remove that risk
// entirely rather than find out at test time.
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

describe('AuthSplitLayout', () => {
  it('renders children, the app name, and the tagline', () => {
    render(
      <AuthSplitLayout appName="Vivexy">
        <div>Form content</div>
      </AuthSplitLayout>
    );

    expect(screen.getByText('Form content')).toBeInTheDocument();
    // Appears twice: once in the mobile top bar, once in the desktop
    // brand panel -- both render unconditionally, visibility is CSS-only
    // (Tailwind `hidden`/`md:hidden`), so both exist in the DOM in jsdom.
    expect(screen.getAllByText('Vivexy').length).toBe(2);
    expect(
      screen.getByText('AI Workspaces for Professional Teams')
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/components/auth/__tests__/auth-split-layout.test.tsx`
Expected: FAIL — `auth-split-layout.tsx` doesn't exist.

- [ ] **Step 3: Implement**

Create `packages/core/src/components/auth/auth-split-layout.tsx`:

```tsx
import Image from 'next/image';

export function AuthSplitLayout({
  children,
  appName,
}: {
  children: React.ReactNode;
  appName: string;
}) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-2">
      {/* Mobile only: slim top bar, logo + app name, no tagline -- keeps
          brand presence without pushing the form below the fold. */}
      <div className="flex items-center gap-2 px-4 py-3 md:hidden">
        <Image
          src="/logo.png"
          alt={appName}
          width={24}
          height={24}
          className="rounded-sm object-contain shrink-0"
        />
        <span className="font-semibold text-lg">{appName}</span>
      </div>

      {/* Desktop only: full brand panel */}
      <div className="hidden md:flex flex-col justify-between bg-primary-900 text-primary-foreground p-10">
        <div className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt={appName}
            width={28}
            height={28}
            className="rounded-sm object-contain shrink-0"
          />
          <span className="font-semibold text-lg">{appName}</span>
        </div>
        <p className="font-serif text-3xl leading-snug max-w-sm">
          AI Workspaces for Professional Teams
        </p>
        <p className="text-sm opacity-70">
          &copy; {new Date().getFullYear()} {appName}
        </p>
      </div>

      {/* Form panel -- shared by both mobile and desktop */}
      <div className="flex items-center justify-center px-4 py-10 md:py-0">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
```

Notes on why this works without extra responsive plumbing:
- The outer container is only a grid at `md:` and up (`md:grid
  md:grid-cols-2`). Below that, it's plain block flow, so the three
  children simply stack top to bottom in source order (mobile bar, then
  the desktop panel — hidden via `hidden`, contributing no layout — then
  the form panel).
- At `md:` and up, the mobile bar (`md:hidden`) is removed from layout
  entirely (`display: none`), so the grid's two columns are exactly the
  desktop brand panel and the form panel.
- `bg-primary-900` and `text-primary-foreground` are real Tailwind
  utilities here because `packages/ui/theme.css`'s `@theme inline` block
  maps `--color-primary-900`/`--color-primary-foreground` from the
  corresponding CSS custom properties — no new color tokens needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run src/components/auth/__tests__/auth-split-layout.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/components/auth/auth-split-layout.tsx packages/core/src/components/auth/__tests__/auth-split-layout.test.tsx
git commit -m "feat: add AuthSplitLayout for the login/register pages"
```

---

## Task 3: Wire AuthSplitLayout into the login and register pages

**Files:**
- Modify: `apps/frontend/app/login/page.tsx`
- Modify: `apps/frontend/app/register/page.tsx`

- [ ] **Step 1: Update the login page**

Replace the full contents of `apps/frontend/app/login/page.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoginForm } from '@vivexy/core/auth/login-form';
import { AuthSplitLayout } from '@vivexy/core/auth/auth-split-layout';
import { APP_NAME } from '@/constants/project';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_AUTH_ENABLED === 'false') {
      router.replace('/contact?interest=request-demo');
    }
  }, [router]);

  if (process.env.NEXT_PUBLIC_AUTH_ENABLED === 'false') return null;

  return (
    <AuthSplitLayout appName={APP_NAME}>
      <LoginForm />
    </AuthSplitLayout>
  );
}
```

This removes the page's own "Welcome back" heading entirely —
`LoginForm` (Task 4) becomes the page's only heading.

- [ ] **Step 2: Update the register page**

Replace the full contents of `apps/frontend/app/register/page.tsx`:

```tsx
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
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors. (Both pages will visually look broken/double-headed
until Tasks 4-5 land — that's expected mid-plan, not a regression to fix
here.)

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/app/login/page.tsx apps/frontend/app/register/page.tsx
git commit -m "feat: wire AuthSplitLayout into login and register pages"
```

---

## Task 4: Redesign login-form.tsx content

**Files:**
- Modify: `packages/core/src/components/auth/login-form.tsx`

- [ ] **Step 1: Replace the Card-based markup with plain content**

Edit `packages/core/src/components/auth/login-form.tsx`. Replace the
imports block:

```tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLogin } from '@vivexy/core/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Button } from '@vivexy/ui/button';
import { Input } from '@vivexy/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@vivexy/ui/form';
import { Alert, AlertDescription } from '@vivexy/ui/alert';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { GoogleIcon, MicrosoftIcon } from './sso-icons';
```

(Drops the `Card`/`CardContent`/`CardDescription`/`CardFooter`/
`CardHeader`/`CardTitle` import from `@vivexy/ui/card` — no longer used —
and adds the new icon import.)

Keep `loginSchema`, `LoginFormData`, `API_URL`, and `handleSSOLogin`
exactly as they are (all untouched by this task — the OAuth-state-nonce
logic doesn't change).

Replace the `return (...)` of the `LoginForm` component:

```tsx
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-serif font-semibold">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to your account to continue
        </p>
      </div>

      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => handleSSOLogin('google')}
        >
          <GoogleIcon />
          Continue with Google
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => handleSSOLogin('microsoft')}
        >
          <MicrosoftIcon />
          Continue with Microsoft
        </Button>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            Or continue with email
          </span>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {loginMutation.error && (
            <Alert variant="destructive">
              <AlertDescription>
                {loginMutation.error.message}
              </AlertDescription>
            </Alert>
          )}

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="Enter your email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      {...field}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>
      </Form>

      <div className="text-sm text-muted-foreground text-center">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-primary hover:underline">
          Sign up
        </Link>
      </div>
    </div>
  );
```

Two details worth noting:
- The icons render with no `className` — `@vivexy/ui/button`'s own
  `buttonVariants` base style already includes
  `[&_svg:not([class*='size-'])]:size-4`, which auto-sizes any bare
  `<svg>` child to 16px, and `gap-2` is already baked into the button's
  base layout. Passing an extra size className would just be redundant.
- The divider's mask span changes from `bg-card` to `bg-background`:
  the old version matched the `Card` component's background color so
  the line looked like it broke behind the text; now that there's no
  `Card`, the surrounding background really is the page's own
  `bg-background` (cream), so the mask must match that instead or the
  line will visibly show through a mismatched color.

- [ ] **Step 2: Run the existing test to confirm it still passes unchanged**

Run: `cd packages/core && npx vitest run src/components/auth/__tests__/login-form.test.tsx`
Expected: PASS (2/2) — the test matches on button accessible names and
`sessionStorage`/`window.location` behavior, none of which this markup
change touches.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/components/auth/login-form.tsx
git commit -m "feat: redesign LoginForm without Card wrapper, add SSO icons"
```

---

## Task 5: Redesign register-form.tsx content

**Files:**
- Modify: `packages/core/src/components/auth/register-form.tsx`

- [ ] **Step 1: Replace the Card-based markup with plain content**

Edit `packages/core/src/components/auth/register-form.tsx`. Replace the
imports block:

```tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRegister } from '@vivexy/core/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Button } from '@vivexy/ui/button';
import { Input } from '@vivexy/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@vivexy/ui/form';
import { Alert, AlertDescription } from '@vivexy/ui/alert';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { GoogleIcon, MicrosoftIcon } from './sso-icons';
```

(Same drop of the `Card`-family import, same new icon import. Keep
`registerSchema`, `RegisterFormData`, `API_URL`, and `handleSSOLogin`
exactly as they are — untouched by this task.)

Replace the `return (...)` of the `RegisterForm` component:

```tsx
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-serif font-semibold">Create an account</h1>
        <p className="text-sm text-muted-foreground">
          Enter your information to create your account
        </p>
      </div>

      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => handleSSOLogin('google')}
        >
          <GoogleIcon />
          Continue with Google
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => handleSSOLogin('microsoft')}
        >
          <MicrosoftIcon />
          Continue with Microsoft
        </Button>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            Or continue with email
          </span>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {registerMutation.error && (
            <Alert variant="destructive">
              <AlertDescription>
                {registerMutation.error.message}
              </AlertDescription>
            </Alert>
          )}

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full Name</FormLabel>
                <FormControl>
                  <Input placeholder="Enter your full name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="Enter your email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      {...field}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm your password"
                      {...field}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
            {registerMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account...
              </>
            ) : (
              'Create account'
            )}
          </Button>
        </form>
      </Form>

      <div className="text-sm text-muted-foreground text-center">
        Already have an account?{' '}
        <Link href="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </div>
    </div>
  );
```

- [ ] **Step 2: Run the existing tests to confirm they still pass unchanged**

Run: `cd packages/core && npx vitest run src/components/auth/__tests__/register-form.test.tsx`
Expected: PASS (2/2).

- [ ] **Step 3: Run the full frontend test suite**

Run: `cd packages/core && npm run test`
Expected: all PASS, no regressions (includes Task 2's new
`auth-split-layout.test.tsx`).

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/components/auth/register-form.tsx
git commit -m "feat: redesign RegisterForm without Card wrapper, add SSO icons"
```

---

## Task 6: Build check and manual responsive verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck and build the frontend**

Run: `cd apps/frontend && npx tsc --noEmit && npm run build`
Expected: both succeed with no errors, `/login` and `/register` listed
as statically prerendered routes.

- [ ] **Step 2: Manual browser verification**

Run: `cd apps/frontend && npm run dev`, then in a browser:

- Visit `http://localhost:3000/login` at a desktop width (~1280px):
  confirm the split layout renders — dark olive brand panel on the left
  with the real logo, "Vivexy", and the "AI Workspaces for Professional
  Teams" tagline in serif; the login form on the right with Google/
  Microsoft icons visible on their buttons; exactly ONE heading
  ("Welcome back") — no duplicate heading above it.
- Resize the browser (or use devtools device emulation) to a phone
  width (~375px): confirm the brand panel collapses to a slim top bar
  showing just the logo + "Vivexy" (no tagline, no dark background
  block), the form renders full-width below it, and there's no
  horizontal scrollbar.
- Repeat both checks on `http://localhost:3000/register`: confirm the
  same layout treatment, that all four fields (name/email/password/
  confirm password) fit and scroll correctly on the phone width, and
  that there's exactly one heading ("Create an account").
- Click "Continue with Google" on either page and confirm it still
  navigates to the backend's `/auth/oauth/google/login?state=...` URL
  (the OAuth flow itself is unchanged by this plan — this just confirms
  the markup change didn't break the existing click handler).

- [ ] **Step 3: Report findings**

If anything looks wrong (layout breaking at some width, icons missing,
duplicate heading still present), fix it directly and re-verify before
moving on — this is the last task in the plan, nothing downstream
depends on it finishing a particular way.
