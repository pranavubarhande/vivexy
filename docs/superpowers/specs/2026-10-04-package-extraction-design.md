# Extract vivexy into shared packages (open-core prep)

Date: 2026-10-04

## Goal

Restructure the `vivexy` monorepo so the reusable product logic lives in
importable packages (`@vivexy/ui`, `@vivexy/core` on the TS side,
`vivexy-agents-core` on the Python side), rather than being owned
directly by `apps/frontend` and `apps/agents-service`. This is
preparation for two future, separate efforts — **not** part of this
work:

- Making the `vivexy` GitHub repo public (a one-way, externally-visible
  action, done later with explicit sign-off once this restructuring is
  finished and reviewed).
- Building `vivexy-legal`, `vivexy-finance`, `vivexy-compliance` as new,
  private repos that depend on these packages and add vertical-specific
  frontend UI and (eventually) vertical-specific backend logic on top.

All work in this spec happens on a branch cut from `origin/dev`
(matching the convention from the marketing extraction), stays local
(nothing pushed) until reviewed.

## Decisions made during brainstorming

- **`app/tools/{legal,finance,compliance}` in `agents-service` stay in
  the open-source core**, as reference implementations. Verified two of
  the three (`sec_edgar_tools.py`, `sanctions_tools.py`) use only free,
  public, no-API-key data sources (SEC EDGAR full-text search, OFAC/EU/UN
  sanctions lists) — no paid vendor keys, no client-specific logic. They
  demonstrate "how a vertical tool plugs into the framework," which is
  good template value, not something that needs protecting.
- **Verticals need genuinely different frontend code**, not just
  theming — so real `packages/ui` + `packages/core` extraction is
  necessary work, not something that can be skipped by just
  parameterizing one shared app.
- **Execution approach**: incremental, layer-by-layer, each layer
  independently buildable and reviewed before the next — same process
  used for the marketing-pages extraction (subagent-driven-development,
  two-stage review per task). Rejected: big-bang move (too large a diff
  to review safely) and thin re-export facades (doesn't actually
  decouple the packages from the apps, so a future private repo still
  couldn't depend on them cleanly).

## Architecture

```text
vivexy/ (monorepo, npm workspaces already declare "packages/*")
├── packages/
│   ├── ui/              (TS, @vivexy/ui)   — design-system primitives
│   ├── core/             (TS, @vivexy/core) — product layer: auth, chat,
│   │                                           dashboard, settings, hooks,
│   │                                           services, types
│   └── agents-core/      (Python, vivexy-agents-core, new uv workspace
│                           member) — agent orchestration, tools, skills,
│                           business logic, models, routes (as Blueprints)
├── apps/
│   ├── frontend/          — thin: Next.js routing (app/ directory) +
│   │                          its own branding/config, imports from
│   │                          @vivexy/ui and @vivexy/core
│   └── agents-service/     — thin: Flask app factory (app/__init__.py),
│                              env/secrets config, alembic migrations,
│                              imports vivexy-agents-core
```

The guiding boundary: **packages own reusable logic and components;
apps own routing, deployment config, secrets, and branding.** A future
`apps/legal` (in a separate private repo) depends on the same two TS
packages and adds its own `app/` directory and vertical-specific
components — it never needs to touch or fork `apps/frontend`.

## TypeScript side

### `packages/ui` (`@vivexy/ui`)

Pure design-system primitives, no app-specific state or branding:

- `components/ui/*` (all 24 files: button, badge, dialog, form, input,
  select, sidebar, table, tabs, etc.)
- `utils/common.ts` (the `cn` helper)
- A `theme.css` extracted from `apps/frontend/app/globals.css`'s
  `:root`/`.skin`/`.dark`/`.ocean`/`.midnight`/`.stone` token
  definitions (the `@theme inline` mapping block and all five theme
  blocks). Each app's own `globals.css` becomes thin: `@import
  "tailwindcss"; @import "@vivexy/ui/theme.css";` plus any app-specific
  overrides, instead of duplicating ~300 lines of color tokens per app.

### `packages/core` (`@vivexy/core`)

The product layer — everything that makes this an AI agent workspace,
independent of which vertical or which brand is running it:

- `components/shared/*` (app-shell, auth-provider, markdown-renderer,
  providers, theme-provider, theme-toggle)
- `components/chat/*` (the full chat interface — agentic-chat,
  artifacts-panel, model-selector, etc.)
- `components/dashboard/*` (header, nav-user, sidebar chrome)
- `components/settings/*`
- `components/auth/*` (login-form, register-form)
- `components/desktop/*` (workspace-picker, workspace-provider)
- `components/scheduled-tasks/*`
- `hooks/*` (all 18 hooks)
- `services/*` (all API-client services, including `services/chat/*`)
- `types/*`
- `lib/*` (caseConverters, github-skills, markdown-converters, platform,
  stripe)
- `constants/routes.ts`, `constants/stream-events.ts`
- `configs/billing.ts`
- `agents/*` (catalogue.ts, client-config.ts — the LLM
  provider/model catalogue, generic infra)

**Explicitly excluded from `packages/core`:** `constants/project.ts`
(the `APP_NAME` constant) stays in each app. Branding is exactly the
kind of thing that must differ per vertical/deployment, so
`@vivexy/core` components that need the app name take it as a prop or
read it from an app-supplied config object — they never hard-import a
shared branding constant.

### Stays in `apps/frontend`

- `app/*` (all Next.js routing — login, register, `(dashboard)/*` route
  group). Pages become thin: import and compose components from
  `@vivexy/core`/`@vivexy/ui` rather than defining UI inline. Next.js
  App Router routes must physically live in each app's own `app/`
  directory — this isn't packageable the way components are.
- `app/layout.tsx`, `app/globals.css` (now thin, importing
  `@vivexy/ui/theme.css`)
- `public/*` (logo and other brand assets — inherently app-specific)
- `constants/project.ts` (branding)
- `package.json`, `next.config.ts`, `tsconfig.json`, env files — app-level
  config, updated to add the two new package dependencies via the
  workspace protocol (`"@vivexy/ui": "workspace:*"`, same for `core`)

## Python side

### New: `uv` workspace

No root `pyproject.toml` or `uv.toml` exists yet — this needs to be
created to declare the workspace (`[tool.uv.workspace] members =
["apps/agents-service", "packages/agents-core"]`), so `agents-service`
can depend on `agents-core` as a local editable path dependency with one
shared lockfile. This is net-new config; nothing today sets this up.

### `packages/agents-core` (`vivexy-agents-core`)

- `app/agents/*`
- `app/business_logic/*`
- `app/models/*`
- `app/routes/*` (stay as Flask Blueprints — `apps/agents-service`'s
  `create_app()` factory imports and registers them, same as it already
  imports blueprint objects today, just from the package instead of a
  local module)
- `app/skills/*`
- `app/tools/*` (including `legal/`, `finance/`, `compliance/` — see
  decision above)
- `app/services/*`
- `app/middlewares/*`
- `app/schemas/*`
- `app/constants/*`, `app/enum/*`, `app/types/*`, `app/utils/*`,
  `app/tool_helpers/*`, `app/file_to_process/*`
- `worker/*` (broker, consumer, dispatcher, scheduler,
  scheduled_task_runner — generic task-queue infrastructure, not
  vertical-specific)

### Stays in `apps/agents-service`

- `app.py`, `wsgi.py` (process entrypoints)
- `app/__init__.py` (the `create_app()` factory — the "assembly" layer
  that wires the package's Blueprints into a runnable Flask app)
- `configs/` (top-level: `flask_config.py`, `swagger_config.py`,
  `worker_config.py` — env-specific settings and secrets, must stay
  app-level, never shared)
- `alembic/` (migrations — each deployment owns its own DB schema
  evolution, even though the `Model` classes being migrated live in the
  package)
- `scripts/seed_llm_models.py` (one-off ops script)
- `pyproject.toml` (updated to depend on `vivexy-agents-core` as a
  workspace member)

## Execution approach

Same process as the marketing extraction: a written implementation plan
with bite-sized tasks, executed via subagent-driven-development (fresh
subagent per task, spec-compliance review, then code-quality review).
Rough task ordering (exact tasks get nailed down in the plan):

1. Scaffold `packages/ui` (package.json, tsconfig, build config), move
   `components/ui/*` + `utils/common.ts`, update `apps/frontend` imports,
   verify build.
2. Extract `theme.css` into `packages/ui`, update `globals.css` in
   `apps/frontend` to import it, verify visual parity.
3. Scaffold `packages/core`, move `components/shared/*` +
   `hooks/*` + `services/*` + `types/*` (the lower-level, less
   interdependent pieces first), update imports, verify build.
4. Move `components/chat/*`, `components/dashboard/*`,
   `components/settings/*`, `components/auth/*`, `components/desktop/*`,
   `components/scheduled-tasks/*`, `lib/*`, `constants/{routes,
   stream-events}.ts`, `configs/billing.ts`, `agents/*` into
   `packages/core`. Update `apps/frontend` imports. Verify build.
5. Set up the `uv` workspace (root `pyproject.toml` with
   `[tool.uv.workspace]`), scaffold `packages/agents-core`.
6. Move `app/models/*`, `app/schemas/*`, `app/constants/*`,
   `app/enum/*`, `app/types/*`, `app/utils/*` (the lower-level pieces)
   into `packages/agents-core`, update `apps/agents-service` imports,
   verify the Flask app still starts and existing tests pass.
7. Move `app/agents/*`, `app/business_logic/*`, `app/tools/*`,
   `app/skills/*`, `app/services/*`, `app/middlewares/*`,
   `app/tool_helpers/*`, `app/file_to_process/*`, `worker/*` into
   `packages/agents-core`. Update imports. Verify.
8. Move `app/routes/*` into `packages/agents-core` as importable
   Blueprints, update `app/__init__.py`'s `create_app()` to import them
   from the package. Verify the full app boots and existing tests pass.
9. Final end-to-end verification: `npm run build` (frontend), `uv run
   pytest` (or equivalent) for agents-service, `turbo build` across the
   whole monorepo, confirm nothing in `apps/*` references old
   now-moved paths.

## Testing / verification

Mirrors what's already in place, not a new testing regime:

- Frontend: `npm run build`, `npm run lint`, `npm test` (existing
  vitest suite) after each layer — the existing tests for
  `utils/common.ts`, `lib/caseConverters.ts`, `lib/markdown-converters.ts`
  move with their source files into the relevant package and must still
  pass from their new location.
- Backend: whatever test runner `agents-service` already uses (the
  `app/*/__tests__` and `app/tools/web/__tests__` directories found
  during exploration) — the suite needs to pass after each move, run
  from the package's own location.
- No new test infrastructure introduced — this is a structural move,
  not new functionality, so the verification bar is "nothing broke,"
  not "new coverage added."

## Out of scope (explicit)

- Flipping the `vivexy` GitHub repo to public.
- Publishing any package to npm or PyPI.
- Creating `vivexy-legal`/`vivexy-finance`/`vivexy-compliance` repos.
- Any change to what's inside `app/tools/{legal,finance,compliance}` —
  they move as-is into the package, their content isn't touched.
- Any change to infra/k8s deployment manifests (a future concern once
  the package structure is settled and actually used by more than one
  app).
