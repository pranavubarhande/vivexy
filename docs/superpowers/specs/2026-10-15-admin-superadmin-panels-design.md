# Admin & Superadmin Panels — Scope

Two new control surfaces on top of the existing app:

| Panel          | Who                                           | Scope                         | Route         |
| -------------- | --------------------------------------------- | ----------------------------- | ------------- |
| **Admin**      | A client's Team `OWNER` / `ADMIN`             | Only the team(s) they run     | `/admin`      |
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

| Change                                     | Why                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `users.is_suspended` (bool, default false) | Superadmin can lock a user out; enforced in `auth_middleware`                               |
| `users.last_login_at` (datetime, null)     | Activity tracking, "inactive users" view                                                    |
| `teams.is_suspended` (bool, default false) | Superadmin can suspend a whole client                                                       |
| `teams.seat_limit` (int, null)             | Client contract limit; invites are blocked past it                                          |
| `teams.monthly_budget_usd` (float, null)   | Client admin's spend cap (phase 2 enforcement)                                              |
| `teams.notes` (text, null)                 | Superadmin-only account notes (CRM-style)                                                   |
| New `audit_logs` table                     | `actor_id, action, target_type, target_id, team_id, details (JSON), ip_address, created_at` |

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
- Sidebar "Administration" group: _Admin_ shows if the user administers any
  team, _Superadmin_ only for `SUPER_ADMIN`. Pages show an access-denied state
  if opened directly.

## Phase 2 — built

- **Team-attributed usage.** `chats.team_id` and `token_usage.team_id`. The
  sidebar "Usage billed to" switcher tags new chats with a team (membership
  checked); usage is recorded against the chat's team. Admin and superadmin
  views use exact attribution; personal chats are excluded.
- **Budget enforcement.** `/chat/start` refuses team chats for suspended teams
  and disallowed models, and either warns or blocks at the monthly budget
  (`teams.budget_enforcement`). Owners/admins are emailed once at 80% and once
  at 100% each month.
- **Client admin controls.** Allowed models per team, invite emails, bulk
  invite (paste/CSV), usage CSV export. Pending invites are claimed into
  memberships only once the email is proven (verified address, SSO login or
  the verification link), because email verification is soft.
- **Superadmin.** MRR/ARR/churn/trials and AI cost vs MRR; manual plan,
  trial or comp per client (Stripe-billed plans are protected); 30-minute
  read-only "view as user" with banner and audit entry; health tab (DB,
  Redis, broker, failing scheduled tasks); model enable/disable and pricing;
  announcements (global or per client); per-client feature flags (kebab-case,
  readable by members via `GET /teams/<id>/features`).

## Phase 3 — built

- **SSO & domains.** Teams claim an email domain; a superadmin verifies it.
  Verified domains can auto-join verified users and can require SSO
  (password login and password registration are refused).
- **Retention.** Per-team `retention_days`; purged hourly by the scheduler
  (or `scripts/run_maintenance.py`). Chats are deleted in FK-safe order with
  their S3 files; token usage is kept for billing.
- **GDPR.** Superadmin export/erase per user, self-service "Download your
  data". Erasure deletes content, keys and memberships and anonymizes the
  user row so usage totals and the audit log stay consistent. Self-service
  account deletion uses the same path.
- **Support role.** Platform `ADMIN` can read the whole console; every write
  still requires `SUPER_ADMIN`.
- **Alerting.** Platform/per-client spend spikes, signup spikes, failing
  scheduled tasks and over-budget clients. Shown in the console and sent to
  `SLACK_ALERT_WEBHOOK_URL` / `PLATFORM_ALERT_EMAILS`, deduplicated daily.

## Still open

- Stripe is still a placeholder (`routes/stripe.py`), so revenue only counts
  manual subscriptions until the webhook writes to `subscriptions`.
- Ownership transfer is not implemented (role changes exclude `OWNER`).
- Domain verification is a manual superadmin step (no DNS TXT check yet).
- Feature flags are stored and exposed but nothing reads them yet.
- Scheduled tasks create personal chats, so they are not billed to teams.
- Deleting chats does not remove LangGraph checkpoint state stored in Redis.
- The existing `DELETE /chat/<id>` relies on ORM cascades that aren't
  configured for messages/artifacts/todos; `hard_delete_chats` in
  `business_logic/data_lifecycle.py` is the FK-safe alternative.
