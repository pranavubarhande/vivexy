# Extending Vivexy

Products built on Vivexy (for example `vivexy-legal` or `vivexy-finance`) depend on
`vivexy-agents-core`, `@vivexy/core` and `@vivexy/ui` as versioned packages and add
their own tools, agents, routes, skills and tables **without editing core**.

## Backend extensions

An extension is a `VivexyExtension` exposed under the `vivexy.extensions` entry-point
group. Installing the distribution is enough; core discovers it at startup.

```toml
# pyproject.toml of the extension package
[project.entry-points."vivexy.extensions"]
legal = "vivexy_legal.extension:extension"
```

```python
# vivexy_legal/extension.py
from pathlib import Path

from agents_core.extensions import ToolContext, VivexyExtension

from vivexy_legal.routes.matters import bp as matters_bp
from vivexy_legal.tools.clauses import get_clause_tools

extension = VivexyExtension(
    name="legal",
    tool_groups={"clauses": lambda context: get_clause_tools(context.chat_id)},
    agents={
        "nda-reviewer": {
            "name": "NDA Reviewer",
            "description": "Reviews NDAs against the firm playbook.",
            "icon": "📝",
            "color": "#0ea5e9",
            "tools": ["base", "document", "clauses"],
            "system_prompt": "You review NDAs ...",  # optional, never sent to clients
        }
    },
    blueprints=[matters_bp],
    skill_dirs=[Path(__file__).parent / "skills"],
)
```

| Field                 | Effect                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `tool_groups`         | Group name → `loader(ToolContext) -> list[BaseTool]`. Agents reference groups in their `tools` list. |
| `agents`              | Merged over core `AGENT_METADATA`; an extension may override a core agent by reusing its id.         |
| `blueprints`          | Registered by `agents_core.app_factory.create_app` after the core blueprints.                        |
| `skill_dirs`          | Directories of `<skill>/SKILL.md`, indexed alongside the built-in skills.                            |
| `include_core_agents` | `False` hides Vivexy's example agents, so the product offers only its own.                           |
| `default_agent_id`    | Agent used when a request names none (chat, scheduled tasks).                                        |

A failing extension or tool loader is logged and skipped; it never takes core down.

Operational commands ship in the package and run from any product image:
`python -m agents_core.cli.seed_llm_models`, `python -m agents_core.cli.promote_superadmin
<email>` and `python -m agents_core.cli.run_maintenance`.

The extension's Flask entrypoint is just:

```python
from agents_core.app_factory import create_app

app = create_app(Config, swagger_template=SWAGGER_TEMPLATE)
```

## Frontend

`@vivexy/core` ships every page as a screen, so a product's Next.js routes are
one-line re-exports:

```tsx
// app/(dashboard)/teams/page.tsx
export { default } from '@vivexy/core/screens/teams';
```

Available screens: `chat`, `dashboard`, `scheduled-tasks`, `settings`, `billing`,
`connectors`, `cost-manager`, `teams`, `admin`, `superadmin`, `login`, `register`,
`verify-email`, `auth-callback`.

Branding, the sidebar and the agent catalogue come from `AppConfigProvider`. The config
holds icon components, so render the provider from a `'use client'` module and wrap the
root layout's children with it:

```tsx
'use client';
import { Scale } from 'lucide-react';
import { AppConfigProvider } from '@vivexy/core/shared/app-config-provider';
import { DEFAULT_NAV_GROUPS } from '@vivexy/core/configs/app-config';

export const LegalAppConfig = ({ children }: { children: React.ReactNode }) => (
  <AppConfigProvider
    config={{
      appName: 'Vivexy Legal',
      logoSrc: '/logo.png',
      auth: { headline: 'AI workspaces for legal teams' },
      navGroups: [
        ...DEFAULT_NAV_GROUPS,
        {
          label: 'Legal',
          items: [{ label: 'Clause Library', href: '/clauses', icon: Scale }],
        },
      ],
      agents: {
        base: [legalAssistant],
        catalogue: legalCatalogue,
        categories: [{ name: 'Legal', color: '#0891b2' }],
        defaultAgentId: 'legal-assistant',
      },
    }}
  >
    {children}
  </AppConfigProvider>
);
```

Anything left out keeps Vivexy's default (`DEFAULT_APP_CONFIG` in
`@vivexy/core/configs/app-config`). Agent ids in the frontend config must match the
agents the backend extension registers.

## Desktop app

`@vivexy/desktop` holds the whole Electron runtime. A product's desktop app is two small
files plus its own `electron-builder.yml` (appId, productName, icons, publish repo) and a
`build:renderer` script that static-exports its own frontend (`NEXT_DESKTOP=1`):

```ts
// main.ts
import * as path from 'path';
import { createDesktopApp } from '@vivexy/desktop';

createDesktopApp({
  productName: 'Vivexy Legal',
  dataNamespace: 'vivexy-legal', // ~/.vivexy-legal-config.json, .vivexy-legal/ in workspaces
  preloadPath: path.join(__dirname, 'preload.js'),
});
```

```ts
// preload.ts (bundle with esbuild: sandboxed preloads can only require 'electron')
import { exposeElectronAPI } from '@vivexy/desktop/preload';

exposeElectronAPI();
```

See `packages/desktop/README.md` for every config option.

## Deployment

The Helm chart is published as `oci://ghcr.io/<owner>/charts/vivexy` at the shared
version. A product deploys it with its own values: its images (`image.owner`,
`image.agentsRepository`, `image.frontendRepository`), hosts, database name and secrets,
`partOf`/`nameOverride` for labels, and `migrations.commands` to run its own Alembic
history after core's:

```yaml
migrations:
  commands:
    - uv run alembic upgrade head
    - uv run alembic -n legal upgrade head
    - uv run python -m agents_core.cli.seed_llm_models
```

The product's agents image must contain a `wsgi.py` exposing `app` (or set
`agents.wsgiApp`), an `alembic.ini`, and uv with the project in its WORKDIR, like
vivexy's `infra/docker/agents-service.Dockerfile`.

## Database migrations

Core migrations ship inside the package (`agents_core/migrations`), so every product
runs them with `script_location = agents_core:migrations` and the default
`alembic_version` table.

Each extension keeps its own Alembic environment for its own tables, with a separate
version table so the two histories never collide:

```ini
# alembic.ini
[alembic]
script_location = agents_core:migrations

[legal]
script_location = migrations
```

```python
# migrations/env.py (extension)
context.configure(
    connection=connection,
    target_metadata=db.metadata,
    version_table="alembic_version_legal",
    include_object=lambda obj, name, type_, reflected, compare_to: (
        type_ != "table" or name in LEGAL_TABLES
    ),
)
```

```bash
uv run alembic upgrade head              # core
uv run alembic --name legal upgrade head # extension
```

Core's `env.py` never autogenerates drops for tables it doesn't define, so extension
tables in the same database are safe.

## Consuming the packages

All three packages share one version and are released together.

```toml
# Python (pyproject.toml of the product)
dependencies = ["vivexy-agents-core==0.2.0"]

# Before the first PyPI release, pin a git tag instead:
[tool.uv.sources]
vivexy-agents-core = { git = "https://github.com/pranavubarhande/vivexy", subdirectory = "packages/agents-core", tag = "v0.2.0" }
```

```jsonc
// package.json of the product frontend
"dependencies": { "@vivexy/core": "0.2.0", "@vivexy/ui": "0.2.0" }
```

`vivexy-agents-core` pins only a few dependencies directly, so a fresh resolve can
pick versions vivexy has never been tested with. Each release therefore ships
`packages/agents-core/constraints.txt`, exported from vivexy's `uv.lock`. Copy it into
the product's root `pyproject.toml` as `[tool.uv] constraint-dependencies` (vivexy-legal
has `scripts/sync_vivexy_constraints.py` for this) so the product runs the same versions
as vivexy.

`@vivexy/core` and `@vivexy/ui` ship TypeScript source, so the Next.js app must
transpile them and let Tailwind scan them:

```ts
// next.config.ts
transpilePackages: ['@vivexy/ui', '@vivexy/core'],
```

```css
/* globals.css */
@import '@vivexy/ui/theme.css';
@source '../node_modules/@vivexy/ui/src/**/*.{ts,tsx}';
@source '../node_modules/@vivexy/core/src/**/*.{ts,tsx}';
```

For local co-development against a vivexy checkout, point the dependencies at it
(`vivexy-agents-core = { path = "../vivexy/packages/agents-core", editable = true }`,
`npm link`) and switch back before committing.

## Releasing

```bash
npm run release:version -- 0.4.0   # bumps ui, core, desktop, agents-core, the chart and lockfiles
git commit -am "chore: release 0.4.0"
# open a pull request and merge it to main
```

Then go to **Actions > release > Run workflow** and enter `0.4.0`. The workflow checks that
every package, the chart and `constraints.txt` are at that version, creates the tag
`v0.4.0` on `main` and publishes to npm (`NPM_TOKEN` secret), PyPI (trusted publishing,
`pypi` environment) and `oci://ghcr.io/<owner>/charts/vivexy`. It refuses to run from
another branch, for a version that doesn't match the code, or for a tag that already
exists. Pushing a `v*` tag by hand still runs the same jobs.

The full checklist, with verification and what to do when a job fails, is in
[DAY_TO_DAY.md](DAY_TO_DAY.md#releasing).

Follow semver: until 1.0, a minor bump may break extensions, so call out breaking changes
in `CHANGELOG.md`.
