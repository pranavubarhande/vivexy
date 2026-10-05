# SSO + Email Verification — Design

## Goal

Add Google and Microsoft SSO login, and email verification for password-based
registrations, to vivexy's existing homegrown JWT auth system — without
migrating to Auth0. Both are additive: the current `/auth/login`,
`/auth/register`, `/auth/me` endpoints and JWT issuance (`generate_token`)
stay exactly as they are today.

## Current state (for context)

- Auth: `packages/agents-core/src/agents_core/routes/auth.py` +
  `utils/auth.py`. Password hashed with bcrypt, JWT signed with
  `JWT_SECRET_KEY` (HS256, 7-day expiry).
- `User` model (`packages/agents-core/src/agents_core/models/user.py`):
  `password` is `nullable=False`. No `email_verified`, no OAuth identity
  columns.
- Frontend stores the JWT in `localStorage['token']`
  (`packages/core/src/components/shared/auth-provider.tsx`,
  `packages/core/src/hooks/useAuth.ts`), attached via an axios request
  interceptor (`packages/core/src/services/axiosInstance.service.ts`).
  Login/register pages: `apps/frontend/app/login/page.tsx`,
  `apps/frontend/app/register/page.tsx`.
- No email-sending infra exists (no SMTP/SendGrid/Resend). AWS credentials
  already exist in `.env` (used for S3), but SES was not chosen — see
  Decisions below.
- Alembic is already set up (`apps/agents-service/alembic.ini`) for schema
  migrations.
- Redis is already a hard dependency of this app (chat streaming, pubsub,
  LangGraph checkpoints) — reused here for short-lived tokens rather than
  adding new DB tables for them.

## Decisions

These were confirmed during brainstorming and drive the design below:

- **SSO providers (v1):** Google and Microsoft only.
- **Email provider:** Resend (not AWS SES, despite AWS creds already being
  present — chosen for lower setup friction over reusing existing infra).
- **Verification gate:** soft gate. Users can log in and use the app
  immediately after registering; a persistent "verify your email" banner
  nags until they do. Nothing is blocked server-side pending verification.
- **SSO accounts skip verification:** Google/Microsoft already verify the
  email before allowing sign-in with it, so SSO-created or SSO-linked
  accounts get `email_verified=True` immediately. No verification email is
  sent for them.
- **Account linking:** auto-link by email. If a Google/Microsoft login's
  email matches an existing password-based account, it's treated as the
  same account (no new user row), and that account gets
  `email_verified=True` plus the provider identity attached.
- **OAuth token delivery (approach B of 3 considered):** the backend's OAuth
  callback never puts the real JWT in a URL. It redirects to the frontend
  with a one-time opaque exchange code; the frontend immediately trades
  that code for the real JWT via a POST request whose response body carries
  the token. Rejected alternatives: (A) putting the JWT directly in the
  redirect URL — simpler but leaves a live credential in browser history /
  `Referer` headers / proxy logs; (C) popup window + `postMessage` — avoids
  a full-page redirect but adds popup-blocker and cross-window-messaging
  complexity that buys nothing here, since login/register are already
  plain full-page routes with no SPA state to preserve across a redirect.
- **Multi-provider identity (deliberate v1 simplification):** `User` gets a
  single `oauth_provider` / `oauth_subject_id` pair, not a join table
  supporting multiple simultaneously-linked providers per user. Email stays
  the real source of identity truth — logging in via a second provider
  later still correctly resolves to the same account (via the email
  fallback match), it just overwrites which provider is "on record" in
  those two columns. A full multi-provider-identity table is explicitly out
  of scope for v1; revisit only if a real need for "show all linked
  providers" UI shows up.

## Data model changes

`packages/agents-core/src/agents_core/models/user.py`:

- `password`: `nullable=False` → `nullable=True`. Safe migration — every
  existing row already has a password, so no backfill is needed; this only
  relaxes the constraint for new SSO-only rows going forward.
- New column `email_verified` (`Boolean`, `default=False`, `nullable=False`).
- New column `oauth_provider` (`String`, nullable) — `"google"` or
  `"microsoft"`.
- New column `oauth_subject_id` (`String`, nullable) — the provider's stable
  user id (the `sub` claim), used to look up returning SSO users without
  depending on email staying constant.

One Alembic migration covers all three changes.

No new database tables. Two kinds of short-lived, single-use tokens are
needed by this design (the email verification token, and the OAuth
exchange code); both live in Redis as plain key→value pairs with a TTL
rather than as rows in Postgres, consistent with how the rest of the app
already treats Redis as the place for ephemeral, non-authoritative state.

## SSO flow (Google / Microsoft, via Authlib)

1. Frontend: a "Continue with Google" / "Continue with Microsoft" button on
   the login and register pages navigates the browser (not a fetch) to
   `GET {API_URL}/auth/oauth/<provider>/login`.
2. Backend: Authlib's Flask OAuth client redirects the browser to the
   provider's consent screen, with the backend's own callback URL as
   `redirect_uri`. OAuth `state` (CSRF protection) and PKCE verifier are
   handled by Authlib using Flask's existing signed-cookie session
   (`SECRET_KEY` is already configured) — this is the one place the
   otherwise-stateless JWT API uses a session cookie, scoped to just this
   brief redirect round-trip.
3. User authenticates and consents on the provider's site.
4. Provider redirects back to backend `GET /auth/oauth/<provider>/callback`
   with an authorization code.
5. Backend exchanges the code for tokens and fetches the user's profile
   (email, name, the provider's stable subject id).
6. Find-or-create, in order:
   - Match an existing `User` by `(oauth_provider, oauth_subject_id)` —
     fast path for a returning SSO user.
   - Else match by `email` — if found, attach `oauth_provider` /
     `oauth_subject_id` to that row and set `email_verified=True` (the
     auto-link decision).
   - Else create a new `User`: `email`, `name` from the provider profile,
     `password=None`, `oauth_provider`, `oauth_subject_id`,
     `email_verified=True`.
7. Backend issues a JWT exactly as today, via the existing
   `generate_token(user.id, user.email)` — no changes to token shape or
   verification.
8. Backend generates an opaque one-time code (`secrets.token_urlsafe`),
   stores `oauth_exchange:<code> → <jwt>` in Redis with a 60s TTL, and
   redirects the browser to `{FRONTEND_URL}/auth/callback?code=<code>`.
9. Frontend `/auth/callback` page, on mount, POSTs the code to a new
   `POST /auth/oauth/exchange` endpoint. The backend does a single
   `GET`+`DELETE` on the Redis key (single-use) and returns
   `{user, token}` — the same response shape `/auth/login` and
   `/auth/register` already return. The frontend stores the token in
   `localStorage` exactly as `useAuth`/`auth-provider.tsx` already do for
   password login, then redirects into the app.
10. If the user cancels/denies consent, or any step fails, the backend
    redirects to `{FRONTEND_URL}/login?error=oauth_failed` instead of the
    callback-with-code path; the login page shows a friendly inline error.

## Email verification flow

1. On `POST /auth/register` (password path only — SSO accounts never go
   through this), the created `User` has `email_verified=False`. The
   backend generates a random token (`secrets.token_urlsafe(32)`), stores
   `email_verify:<token> → <user_id>` in Redis with a 24h TTL, and sends a
   verification email via Resend containing a link to
   `{FRONTEND_URL}/verify-email?token=<token>`.
2. Frontend `/verify-email` page reads the token from the query string and
   POSTs it to a new `POST /auth/verify-email` endpoint.
3. Backend looks up the Redis key: if present, sets
   `user.email_verified = True`, deletes the key, returns success. If
   absent (expired or already used), returns an error the frontend renders
   as "this link has expired" with a resend option — not a raw error.
4. A new authenticated `POST /auth/resend-verification` endpoint (uses the
   caller's JWT to identify the user) generates a new token/Redis key and
   re-sends the email. The previous token isn't explicitly revoked — it
   simply remains valid until its own 24h TTL expires, so an older
   verification email still works if the user clicks it instead of the
   newest one. This is a deliberate simplification (avoids tracking "the
   current token per user" as a second key); revisit only if stale-link
   reuse turns out to matter. Resending itself is rate-limited to roughly
   once per 60 seconds per user via a Redis cooldown key
   (`resend_cooldown:<user_id>`, 60s TTL, checked before allowing another
   send).
5. `UserResponse`/`exclude_password()` now include `email_verified` so the
   frontend knows whether to show the reminder banner.

## Frontend changes

- `packages/core/src/components/auth/login-form.tsx` and the register
  page/form: add "Continue with Google" and "Continue with Microsoft"
  buttons. These are plain navigations to the backend's OAuth login URLs —
  no new client-side form logic.
- New route `apps/frontend/app/auth/callback/page.tsx`: on mount, reads
  `code` from the query string, POSTs it to `/auth/oauth/exchange`, stores
  the returned token in `localStorage` the same way `auth-provider.tsx`
  already does, then redirects into the app. Handles the `error=oauth_failed`
  case by redirecting to `/login` with the error surfaced.
- New route `apps/frontend/app/verify-email/page.tsx`: reads `token` from
  the query string, POSTs to `/auth/verify-email`, shows success/failure
  state with a resend option on failure.
- A persistent (dismissible-per-session, reappears next load until actually
  verified) "verify your email" banner added to the dashboard shell
  (`AppShell`, consumed via `apps/frontend/app/layout.tsx`), shown when the
  current user's `email_verified` is `false`. Includes a "resend" button
  wired to `/auth/resend-verification`.
- `useAuth`/`auth-provider.tsx`: the user object already round-trips
  through `/auth/me` and login/register responses — `email_verified` flows
  through automatically once the backend includes it.

## New environment variables

Added to `apps/agents-service/.env.example` / `flask_config.py`:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT`
  (default `common`, supporting both work/school and personal accounts)
- `RESEND_API_KEY`
- `FRONTEND_URL` — does not exist today (only `CORS_ORIGINS` implies the
  frontend origin); needed to build email verification links and the final
  OAuth redirect target.

## Error handling summary

- OAuth consent denied/cancelled, or any exchange step fails → redirect to
  `/login?error=oauth_failed`, friendly inline message, no crash.
- Verification token expired or already used → clear "link expired"
  message plus a resend action, not a raw error payload.
- Resend spam → rejected with a clear "please wait" message while the
  Redis cooldown key is still set.
- OAuth exchange code expired, already used, or forged → `/auth/oauth/exchange`
  returns 400; frontend sends the user back to `/login` with an error.

## Testing

- **Backend:** unit tests for the find-or-create logic (new SSO user,
  auto-link-by-email, returning SSO user via provider+subject_id), the
  token generation/verification helpers, and the
  verify-email/resend-verification endpoints. Authlib's OAuth client is
  mocked in tests — no real calls to Google/Microsoft from CI.
- **Frontend:** tests for the SSO buttons' target URLs, the
  `/auth/callback` exchange-and-store-and-redirect flow (including the
  error path), and the verification banner's visibility logic
  (shown/hidden based on `email_verified`).
- **Manual:** one real end-to-end click-through against actual Google and
  Microsoft OAuth consent screens before shipping — this leg can't be
  meaningfully automated without real provider sandbox credentials.
