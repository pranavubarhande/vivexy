# Login/Register Pages Redesign — Design

## Goal

Improve the visual design of vivexy's login and register pages: fix a
duplicate-heading bug, move to a split-screen layout (brand panel + form),
add real Google/Microsoft icons to the SSO buttons, and make the whole
thing work cleanly on phone-sized screens.

## Current state (for context)

- `packages/core/src/components/auth/login-form.tsx` /
  `register-form.tsx`: a shadcn/ui `Card` (`CardHeader`/`CardContent`/
  `CardFooter`) centered on the page, containing "Continue with Google"/
  "Continue with Microsoft" buttons (plain text, no icons — added this
  session), a divider, and a `react-hook-form` + `zod` email/password
  form.
- `apps/frontend/app/login/page.tsx` / `register/page.tsx`: each wraps
  its form component in a centered `<div>` with its OWN heading
  ("Welcome back" / "Create an account") directly above the form card —
  which already has its own heading inside `CardHeader` ("Sign in" /
  "Sign up"). Two stacked headings, duplicate messaging.
- Brand palette (`packages/ui/theme.css`): cream background (`#FFFCEB`),
  olive primary (`#5E6738`), serif display font (Fraunces) used
  elsewhere for headline text (e.g. "Good evening, {name}" on the chat
  page), Inter for body text.

## Decisions (confirmed during brainstorming, including two rounds of
visual mockups)

- **Layout direction:** split-screen — a brand panel (dark olive, logo +
  serif tagline) on one side, the form on the other. Chosen over (a) a
  polished-but-same-shape single column and (b) a chromeless minimal
  layout — split-screen was the clear preference.
- **Mobile behavior:** below the `md` (768px) Tailwind breakpoint, the
  brand panel collapses to a slim top bar showing only a small logo
  mark — no tagline — and the form takes the full width below it.
  Chosen over keeping a shortened brand band with the tagline still
  visible, specifically to get straight to the form on small screens
  rather than spending vertical space on mood-setting copy.
- **Duplicate heading fix:** the page-level wrapper's heading
  ("Welcome back" / "Create an account") is removed entirely. The form
  component's own single heading (now rendered as plain content, not
  inside a `CardHeader`) is the only heading on the page.
- **Card chrome:** `login-form.tsx`/`register-form.tsx` drop the
  shadcn `Card` wrapper entirely. The split layout's right-hand panel is
  already visually distinct from the left brand panel, so a card
  border/shadow around the form inside it would be redundant.
- **SSO icons:** real Google ("G" four-color) and Microsoft (four-color
  square) SVG icons next to the button text, replacing today's
  plain-text-only buttons. Click behavior (`handleSSOLogin`, the
  OAuth-state-nonce generation) is unchanged — this is a visual-only
  change to those buttons.
- **Scope:** both login and register pages get the same layout, same
  icon treatment, and the same heading fix — not just login.

## Architecture

A new shared component, `AuthSplitLayout`
(`packages/core/src/components/auth/auth-split-layout.tsx`), wraps both
pages:

- **Desktop (`md:` and up):** a two-column grid. Left column: a fixed-
  width dark olive panel containing the real Vivexy logo (`next/image`,
  `src="/logo.png"`, same asset `dashboard/sidebar.tsx` already uses,
  alongside the app name) and a serif tagline using the app's real
  existing tagline, "AI Workspaces for Professional Teams" (pulled from
  `apps/frontend/app/layout.tsx`'s metadata title, not invented new
  copy). Right column: the page's `children` (the login or register
  form), vertically centered with a max-width constraint so the form
  itself doesn't stretch edge-to-edge on wide screens.
- **Mobile (below `md`):** the left panel collapses to a short top bar
  showing only the logo + app name (same small lockup as the sidebar
  header uses at `dashboard/sidebar.tsx:89-96`, not a new mark) — no
  tagline, no olive background block, just enough to keep brand
  presence without pushing the form below the fold. `children` render
  full-width immediately below it.

`APP_NAME` is deliberately an app-level constant, not something
`packages/core` imports directly (the same reason `AppShell` takes
`appName` as a prop from `apps/frontend/app/layout.tsx` rather than
importing it itself — see `AppShell`'s `appName?: string` prop and its
one call site in `layout.tsx`). `AuthSplitLayout` follows the identical
pattern: it takes `appName: string` as a prop, and `login/page.tsx` /
`register/page.tsx` pass `APP_NAME` into it, exactly as `layout.tsx`
already does for `AppShell`.

`apps/frontend/app/login/page.tsx` and `register/page.tsx` are
simplified to:

```tsx
export default function LoginPage() {
  // ...existing NEXT_PUBLIC_AUTH_ENABLED redirect logic, unchanged...
  return (
    <AuthSplitLayout appName={APP_NAME}>
      <LoginForm />
    </AuthSplitLayout>
  );
}
```

— removing their own heading/description markup entirely, since
`LoginForm`/`RegisterForm` now render that themselves as the page's only
heading.

## Components

- **`AuthSplitLayout`** (new): takes `children: React.ReactNode` and
  `appName: string` (passed in by each page from `APP_NAME`, the same
  pattern `AppShell` already uses — see note above). Tagline and logo
  path are fixed content, not per-page configurable — login and
  register share identical brand panel content.
- **`login-form.tsx` / `register-form.tsx`** (modified): the `Card`/
  `CardHeader`/`CardContent`/`CardFooter` wrapper is removed. Content
  becomes: heading (plain `<h1>`-equivalent styled text, serif),
  subtext, the two SSO buttons (now with icons), the divider, the
  `react-hook-form` email/password fields (unchanged), the submit
  button, and the footer link ("Don't have an account? Sign up" /
  "Already have an account? Sign in") — all rendered directly, no card
  container. All existing form logic (`useForm`, `zodResolver`,
  `useLogin`/`useRegister`, `handleSSOLogin`, the OAuth nonce generation)
  is untouched — this is a markup/styling change only.
- **`sso-icons.tsx`** (new, small): exports `GoogleIcon` and
  `MicrosoftIcon`, each a plain inline SVG component (no props beyond
  standard `className` passthrough), matching the icons already
  prototyped in the mockups. Used inside the SSO `<Button>`s in both
  forms, replacing the current icon-less buttons.

## Responsive behavior

Breakpoint: Tailwind's `md:` (768px), matching the mockup comparison
(phone vs. desktop split) already approved. `AuthSplitLayout` handles
this internally via Tailwind responsive classes (e.g. `hidden md:flex`
on the full brand panel, a separate `md:hidden` top bar for the logo
mark) — no JS-based viewport detection needed.

## Testing

- Existing `login-form.test.tsx` / `register-form.test.tsx` continue to
  pass unchanged: the icons are decorative SVGs with no text content, so
  they don't affect the accessible button name
  (`getByRole('button', {name: /continue with google/i})` still
  matches).
- One new lightweight test for `AuthSplitLayout`
  (`packages/core/src/components/auth/__tests__/auth-split-layout.test.tsx`):
  renders `children` content, and asserts the brand panel's identifying
  content (e.g. the Vivexy logo text) is present — matching this
  codebase's existing test-effort level for layout-type components
  (e.g. how `app-shell.tsx` itself has no dedicated test, but simpler
  presentational pieces like `chat-header.tsx` do get one).
- No test changes needed for `sso-icons.tsx` itself — it's pure
  presentational SVG markup, consistent with how this codebase doesn't
  test icon components elsewhere (e.g. `lucide-react` icons used
  throughout aren't individually tested).
