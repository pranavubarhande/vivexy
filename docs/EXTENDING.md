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

| Field         | Effect                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `tool_groups` | Group name → `loader(ToolContext) -> list[BaseTool]`. Agents reference groups in their `tools` list. |
| `agents`      | Merged over core `AGENT_METADATA`; an extension may override a core agent by reusing its id.         |
| `blueprints`  | Registered by `agents_core.app_factory.create_app` after the core blueprints.                        |
| `skill_dirs`  | Directories of `<skill>/SKILL.md`, indexed alongside the built-in skills.                            |

A failing extension or tool loader is logged and skipped; it never takes core down.

The extension's Flask entrypoint is just:

```python
from agents_core.app_factory import create_app

app = create_app(Config, swagger_template=SWAGGER_TEMPLATE)
```

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
npm run release:version -- 0.2.0   # bumps ui, core, agents-core and lockfiles
git commit -am "chore: release 0.2.0"
git tag v0.2.0 && git push && git push --tags
```

The `release` workflow verifies the versions match the tag, then publishes to npm
(`NPM_TOKEN` secret) and PyPI (trusted publishing, `pypi` environment). Follow semver:
until 1.0, a minor bump may break extensions, so call out breaking changes in
`CHANGELOG.md`.
