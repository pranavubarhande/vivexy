# Admin & Superadmin Panels — Scope

Two new control surfaces on top of the existing app:

| Panel          | Who                                   | Scope                         | Route         |
| -------------- | ------------------------------------- | ----------------------------- | ------------- |
| **Admin**      | A client's Team `OWNER` / `ADMIN`     | Only the team(s) they run     | `/admin`      |
| **Superadmin** | Platform operator (`User.role = SUPER_ADMIN`) | Every client, user and metric | `/superadmin` |

## Key decisions

1. **A "client" is a `Team`.** Teams already own members, invites, roles
   (`OWNER`/`ADMIN`/`MEMBER`) and subscriptions (`subscriptions.team_id`). We
   reuse them instead of adding a new `Organization` table. If one client later
   needs several teams, an `organizations` table can sit above `teams` without
   changing the panels.
2. **Two separate role systems, never mixed.**
   - Platform role: `users.role` (`USER` | `ADMIN` | `SUPER_ADMIN`). Only
     `SUPER_ADMIN` opens the superadmin panel. `ADMIN` is held back for future
     read-only platform support staff.
   - Client role: `team_members.role`. `OWNER`/`ADMIN` open the admin panel for
     that team only.
3. **The backend is the security boundary.** Every admin/superadmin endpoint is
   guarded by a decorator; the frontend only hides navigation.
4. **No self-service elevation.** A superadmin is created only from the CLI
   (`uv run python scripts/promote_superadmin.py <email>`), or by another
   superadmin.
5. **Every privileged write is audited** in a new `audit_logs` table.

## Pre-requisite security fix (blocking)

`POST /auth/register` builds `UserCreate(**data)`, and `UserCreate` inherits
`role` from `UserBase`, so anyone can sign up with `"role": "SUPER_ADMIN"`.
This is fixed by ignoring `role` at registration and always creating `USER`.

## Data model changes

| Change                                   | Why                                                   |
| ---------------------------------------- | ----------------------------------------------------- |
| `users.is_suspended` (bool, default false) | Superadmin can lock a user out; enforced in `auth_middleware` |
| `users.last_login_at` (datetime, null)   | Activity tracking, "inactive users" view              |
| `teams.is_suspended` (bool, default false) | Superadmin can suspend a whole client              |
| `teams.seat_limit` (int, null)           | Client contract limit; invites are blocked past it   |
| `teams.monthly_budget_usd` (float, null) | Client admin's spend cap (phase 2 enforcement)       |
| `teams.notes` (text, null)               | Superadmin-only account notes (CRM-style)            |
| New `audit_logs` table                   | `actor_id, action, target_type, target_id, team_id, details (JSON), ip_address, created_at` |

One Alembic migration covers all of it.

## Phase 1 — built now

### Backend (`packages/agents-core`)

- `middlewares/auth.py`: suspended users get `403`; new `superadmin_required`
  decorator.
- `business_logic/audit.py`: `record_audit_log(...)` + paginated listing.
- `business_logic/admin.py` + `routes/admin.py` (`/admin/teams/...`, needs team
  `OWNER`/`ADMIN`):
  - `GET  /admin/teams` — teams the caller administers
  - `GET  /admin/teams/<id>/overview` — seats used / limit, pending invites,
    team spend & tokens (sum over members), daily usage series
  - `GET  /admin/teams/<id>/members` — members with last login and per-member
    spend/tokens/messages
  - `PATCH /admin/teams/<id>/members/<user_id>` — change role (owner is
    protected; only the owner can grant `ADMIN`)
  - `GET  /admin/teams/<id>/invites`, `DELETE /admin/teams/<id>/invites/<invite_id>`
  - `PATCH /admin/teams/<id>/settings` — budget
  - `GET  /admin/teams/<id>/audit-logs`
- `business_logic/superadmin.py` + `routes/superadmin.py` (`/superadmin/...`):
  - `GET  /superadmin/overview` — users, new users (7d/30d), active users (30d),
    clients, chats, messages, spend (all-time/30d), plan mix
  - `GET  /superadmin/usage/daily`, `GET /superadmin/usage/by-model` — platform
    usage series and model mix
  - `GET  /superadmin/clients` — paginated + search; owner, seats, plan, spend
  - `GET  /superadmin/clients/<id>` — detail: members, invites, usage, notes
  - `PATCH /superadmin/clients/<id>` — suspend/unsuspend, seat limit, notes
  - `GET  /superadmin/users` — paginated + search + filter (role, suspended)
  - `GET  /superadmin/users/<id>` — detail: teams, usage, chat count
  - `PATCH /superadmin/users/<id>` — suspend, change platform role (cannot
    demote/suspend yourself)
  - `GET  /superadmin/audit-logs`
- `auth.login` records `last_login_at`; `teams.add_team_member` respects
  `seat_limit` and suspended teams.
- `scripts/promote_superadmin.py` in agents-service.
- Tests for the register fix, guards, and the main admin/superadmin flows.

### Frontend (`packages/core` + `apps/frontend`)

- Types, services, React Query hooks: `admin.*`, `superadmin.*`.
- `/admin`: team picker → tabs **Overview** (KPI cards, daily spend chart),
  **Members** (usage per member, role change, remove), **Invites** (revoke),
  **Settings** (budget), **Audit log**.
- `/superadmin`: tabs **Overview** (platform KPIs, daily chart, model mix),
  **Clients** (search, suspend, seat limit, notes in a detail sheet),
  **Users** (search, filter, suspend, role), **Audit log**.
- Sidebar "Administration" group: *Admin* shows if the user administers any
  team, *Superadmin* only for `SUPER_ADMIN`. Pages show an access-denied state
  if opened directly.

## Phase 2 — next

- **Team-attributed usage.** Today `token_usage` and `chats` only carry
  `user_id`, so team spend = sum of members' spend (personal usage included).
  Add `team_id` to `chats` / `token_usage` and an "active team" selector so
  spend is attributed exactly.
- **Budget enforcement** — block or warn in the chat stream when a team passes
  `monthly_budget_usd`; email the admin at 80% / 100%.
- **Client admin controls**: allowed models / agents / connectors per team,
  invite email delivery (currently invites are DB-only), bulk CSV invite,
  export usage CSV.
- **Superadmin revenue**: MRR/ARR, churn and plan changes once Stripe is wired
  (`routes/stripe.py` is still a placeholder), invoices per client, manual plan
  override / comps / trial extension.
- **Impersonation** ("log in as client" for support) — short-lived token,
  banner in the UI, always audited, read-only by default.
- **Ops health**: queue depth (RabbitMQ/Redis stream), failed scheduled-task
  runs, error rate (Sentry link), LLM provider error/latency.
- **Global LLM model management** — enable/disable models, edit pricing
  (`llm_models`), currently only seeded by script.
- **Platform announcements / feature flags per client.**

## Phase 3 — later

- SSO enforcement per client (require Google/Microsoft for a domain), domain
  verification and auto-join.
- Data retention policies per client, GDPR export/delete for a user.
- Read-only `ADMIN` platform role for support staff, with granular permissions.
- Alerting (Slack/email) for anomalies: cost spikes, signup spikes, abuse.
