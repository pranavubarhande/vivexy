<div align="center">

<img src="docs/assets/logo.png" alt="Vivexy" width="96" height="96" />

# Vivexy

**An open source AI workspace for professional teams.**
Agentic chat, domain tools, scheduled automations and team controls, as a web app, a desktop app and a Kubernetes-ready backend.

[![Build and Push](https://github.com/pranavubarhande/vivexy/actions/workflows/build-and-push.yml/badge.svg)](https://github.com/pranavubarhande/vivexy/actions/workflows/build-and-push.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/tag/pranavubarhande/vivexy?label=release&sort=semver)](CHANGELOG.md)
[![PyPI](https://img.shields.io/pypi/v/vivexy-agents-core?label=pypi)](https://pypi.org/project/vivexy-agents-core/)
[![npm](https://img.shields.io/npm/v/@vivexy/core?label=npm)](https://www.npmjs.com/package/@vivexy/core)

[Features](#features) · [Quick start](#quick-start) · [Build on Vivexy](#build-your-own-product-on-vivexy) · [Architecture](#architecture) · [Deployment](#deployment) · [Contributing](#contributing)

<br />

<img src="docs/assets/chat.png" alt="Vivexy chat" width="880" />

</div>

## Why Vivexy

A lot of enterprises are making progress towards AI adoption in their firms. But the platforms most of them build follow a certain template: an agent backend, a chat interface, auth, teams, billing, background workers and a deployment pipeline. Building that, and building it with scalability in mind, takes at least a few months before the first useful feature ships.

I built Vivexy to remove that initial friction, and I'm open sourcing it under the AGPL v3 so you can start from the same place. You get agents that search the web, read your documents, query finance and legal sources, run code in a sandbox and work on a schedule, with the controls a company needs around them: approvals, teams, usage and cost tracking, SSO and an audit trail. Then you spend your time on what makes your product different, or build focused products on top of it, such as a legal or finance edition.

## Features

| Capability                 | What you get                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Agentic chat**           | LangChain and LangGraph agents with streaming (SSE) responses, reasoning and artifact events, human-in-the-loop approvals and cancellation.                                                      |
| **Many models**            | OpenAI, Anthropic, Google, Groq, Mistral, Together, Fireworks and more, with per-model context-window and cost tracking.                                                                         |
| **Domain tools**           | Web search and crawling, finance (Yahoo Finance, SEC EDGAR), legal research (CourtListener, US Code), compliance (sanctions, audit, regulatory feeds), file handling and a Daytona code sandbox. |
| **Agent catalogue**        | 40 ready-made agents across finance, legal, compliance and cross-functional work. Add the ones your team needs.                                                                                  |
| **RAG**                    | Document ingestion, embeddings and retrieval with Pinecone and BM25.                                                                                                                             |
| **Skills and MCP**         | Bundled document skills (docx, pdf, pptx, xlsx, data analysis), user-defined skills and MCP clients.                                                                                             |
| **Artifacts and projects** | Generated documents and spreadsheets, projects, GitHub context and checkpoints.                                                                                                                  |
| **Scheduled tasks**        | Cron-style agent runs executed by a dedicated scheduler and workers.                                                                                                                             |
| **Teams and billing**      | Team management, admin and superadmin panels, Stripe billing, token-usage and cost dashboards.                                                                                                   |
| **Auth**                   | Email and password with verification (Resend), plus Google and Microsoft SSO.                                                                                                                    |
| **Desktop app**            | An Electron app that gives agents local file-system, git and file-parsing tools over IPC.                                                                                                        |

<table>
  <tr>
    <td width="50%"><img src="docs/assets/agents.png" alt="Agent catalogue" /></td>
    <td width="50%"><img src="docs/assets/integrations.png" alt="Integrations" /></td>
  </tr>
  <tr>
    <td align="center"><sub>The agent catalogue</sub></td>
    <td align="center"><sub>Integrations through Composio</sub></td>
  </tr>
</table>

## Quick start

### Prerequisites

- Node.js 20+
- Python 3.11+ (from python.org or Homebrew, not system Python)
- [uv](https://docs.astral.sh/uv/) (`brew install uv` on macOS)
- PostgreSQL and Redis (Redis Stack recommended), and optionally RabbitMQ, running locally on default ports:
  `brew install postgresql@15 redis rabbitmq`

### Run it locally

```bash
git clone https://github.com/pranavubarhande/vivexy.git
cd vivexy

npm run install:all            # Node workspaces, Python deps, Playwright Chromium

cp apps/frontend/.env.example apps/frontend/.env.local
cp apps/agents-service/.env.example apps/agents-service/.env
# Fill in DATABASE_URL, JWT_SECRET_KEY, SECRET_KEY, REDIS_URL and one LLM provider key.

cd apps/agents-service
uv run alembic upgrade head
uv run python scripts/seed_llm_models.py
cd ../..

npm run dev                    # frontend, API, queue worker and scheduler
```

Then open the app at http://localhost:3000. The API runs on http://localhost:5000 and serves Swagger UI.

<details>
<summary><b>Development commands</b></summary>

```bash
npm run dev            # Frontend + API + worker + scheduler
npm run dev:frontend   # Next.js only (port 3000)
npm run dev:agents     # Flask API + worker + scheduler (port 5000)
npm run dev:desktop    # Electron app (needs the frontend built; see Desktop app)

npm run build          # Build everything
npm run test           # All tests (vitest + pytest) via Turborepo
npm run lint           # ESLint + flake8
npm run format         # Prettier + Black + isort
npm run format:check   # Check formatting without changes
```

Python service only:

```bash
cd apps/agents-service
uv run python app.py                            # Run the API
uv run python -m agents_core.worker.consumer    # Run a chat worker
uv run python -m agents_core.worker.scheduler   # Run the scheduled-task scheduler
uv run --extra dev pytest                       # Tests for the service
```

Database migrations (models and migrations live in `packages/agents-core`, commands run from `apps/agents-service`):

```bash
uv run alembic upgrade head                                        # Apply migrations
uv run alembic revision --autogenerate -m "description_of_change"  # New migration
uv run alembic current                                             # Current version
uv run alembic history                                             # History
```

</details>

<details>
<summary><b>Desktop app</b></summary>

```bash
cd apps/desktop
npm run build:all       # Build @vivexy/desktop, static-export the frontend, compile Electron
npm start               # Launch the app
npm run package:mac     # Or package:win / package:linux
```

Installers are published by the [desktop-release](.github/workflows/desktop-release.yml) workflow when a `desktop-v*` tag is pushed. Builds are currently unsigned.

</details>

## Build your own product on Vivexy

Vivexy is released as packages, so a product built on top of it stays small and keeps getting upgrades.

| Package              | Registry                                             | What it gives you                                         |
| -------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| `vivexy-agents-core` | [PyPI](https://pypi.org/project/vivexy-agents-core/) | Agents, tools, API routes, models, migrations and workers |
| `@vivexy/core`       | [npm](https://www.npmjs.com/package/@vivexy/core)    | Every page as a screen, hooks, services and app config    |
| `@vivexy/ui`         | [npm](https://www.npmjs.com/package/@vivexy/ui)      | UI primitives and the theme                               |
| `@vivexy/desktop`    | [npm](https://www.npmjs.com/package/@vivexy/desktop) | The Electron runtime (`createDesktopApp`)                 |
| Helm chart           | `oci://ghcr.io/pranavubarhande/charts/vivexy`        | The Kubernetes deployment                                 |

A product registers its own tools, agents, routes, skills and tables through a Python entry point, brands the UI with one config object and re-exports Vivexy's pages:

```python
# backend: vivexy_legal/extension.py
extension = VivexyExtension(
    name="legal",
    tool_groups={"clause_library": get_clause_library_tools},
    agents={"legal-assistant": {...}},
    blueprints=[clause_templates_bp],
    include_core_agents=False,   # offer only this product's agents
    default_agent_id="legal-assistant",
)
```

```tsx
// frontend: one line per route, branding in one provider
export { default } from '@vivexy/core/screens/teams';

<AppConfigProvider config={{ appName: 'Vivexy Legal', navGroups, agents }}>
```

The full guide, with migrations, desktop and deployment, is in [docs/EXTENDING.md](docs/EXTENDING.md).

## Architecture

```mermaid
flowchart LR
  Web["Web app<br/>Next.js"] --> API["Agents API<br/>Flask"]
  Desktop["Desktop app<br/>Electron"] --> API
  API --> DB[("PostgreSQL")]
  API --> Redis[("Redis")]
  API --> MQ{{"RabbitMQ"}}
  MQ --> Workers["Chat and RAG workers"]
  Scheduler["Scheduler"] --> MQ
  Workers --> Redis
  Workers --> DB
  Workers --> Store[("S3 / MinIO")]
  Workers --> LLMs["LLM providers"]
  Workers --> Tools["Tools: search, finance, legal, sandbox"]
```

`apps/agents-service` is a thin Flask shell. Nearly all backend logic lives in `packages/agents-core`, a uv workspace member that products install from PyPI. Chat turns can run in-process or be dispatched through RabbitMQ to workers, with Redis used for caching, approvals, client tools and the SSE relay. The web and desktop apps share their UI through `@vivexy/core` and `@vivexy/ui`.

**Tech stack**

| Layer          | Technology                                                                           |
| -------------- | ------------------------------------------------------------------------------------ |
| Frontend       | Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, TanStack Query, Vitest |
| Desktop        | Electron, TypeScript, electron-builder                                               |
| Backend        | Flask (Python 3.11+), SQLAlchemy, Alembic, LangChain and LangGraph                   |
| Data           | PostgreSQL, Redis, RabbitMQ, MinIO or S3, Pinecone                                   |
| Observability  | Sentry, Prometheus and Grafana                                                       |
| Infrastructure | Docker, Kubernetes (Helm), ArgoCD, Terraform (GKE), KEDA                             |
| Monorepo       | Turborepo and npm workspaces (Node), uv workspace (Python)                           |

<details>
<summary><b>Project structure</b></summary>

```
vivexy/
├── apps/
│   ├── frontend/                 # Next.js app: routes re-export @vivexy/core screens
│   ├── desktop/                  # Electron app: a thin consumer of @vivexy/desktop
│   └── agents-service/           # Flask service entrypoint
│       ├── app/                  # Calls agents_core.app_factory.create_app
│       ├── configs/              # Flask, worker and Swagger config
│       └── scripts/              # seed_llm_models, promote_superadmin, run_maintenance
├── packages/
│   ├── agents-core/src/agents_core/
│   │   ├── agents/               # Agent factory, LLM factory, MCP client, approvals, pubsub
│   │   ├── routes/               # API blueprints (chat, auth, teams, stripe, rag, ...)
│   │   ├── business_logic/       # Business logic layer
│   │   ├── models/               # SQLAlchemy models
│   │   ├── migrations/           # Alembic environment and versions
│   │   ├── schemas/              # Pydantic schemas
│   │   ├── tools/                # LangChain tools (web, stocks, finance, legal,
│   │   │                         #   compliance, rag, files, sandbox)
│   │   ├── skills/               # Bundled skills (docx, pdf, pptx, xlsx, data-analysis)
│   │   ├── services/             # S3, RAG, file processing
│   │   ├── worker/               # Queue consumer, dispatcher, scheduler
│   │   ├── cli/                  # seed_llm_models, promote_superadmin, run_maintenance
│   │   ├── app_factory.py        # Flask app factory shared with downstream products
│   │   ├── flask_config.py       # Base config shared by the app, worker and scheduler
│   │   └── extensions.py         # Entry-point registry for downstream products
│   ├── core/                     # @vivexy/core: screens, components, hooks, services
│   ├── ui/                       # @vivexy/ui: UI primitives and theme
│   └── desktop/                  # @vivexy/desktop: Electron main, preload and tools
├── infra/
│   ├── docker/                   # Production Dockerfiles
│   ├── k8s/                      # Helm chart, bootstrap add-ons, external-secrets, observability
│   ├── argocd/                   # GitOps application manifests
│   ├── terraform/                # GKE cluster and Workload Identity
│   └── load-tests/               # Chat and registration load tests
├── docs/                         # EXTENDING.md and README images
├── scripts/                      # release-version.mjs, smoke-test.py
├── package.json                  # Root monorepo config
├── pyproject.toml                # uv workspace (agents-service, agents-core)
└── turbo.json                    # Turborepo config
```

</details>

<details>
<summary><b>Environment variables</b></summary>

The `.env.example` files are the source of truth. The main groups are:

**Agents service** (`apps/agents-service/.env`)

```
DATABASE_URL=postgresql://user:password@localhost:5432/vivexy
JWT_SECRET_KEY=...   SECRET_KEY=...
REDIS_URL=redis://localhost:6379

# LLM providers
OPENAI_API_KEY=...   ANTHROPIC_API_KEY=...   GOOGLE_AI_API_KEY=...   GROQ_API_KEY=...

# Optional integrations
EXA_API_KEY=...      PINECONE_API_KEY=...    COMPOSIO_API_KEY=...
AWS_ACCESS_KEY_ID=...  AWS_SECRET_ACCESS_KEY=...  AWS_S3_BUCKET_NAME=...  AWS_S3_REGION=...
SANDBOX_ENABLED=...  DAYTONA_API_KEY=...     COURTLISTENER_API_TOKEN=...
RABBITMQ_URL=...     USE_RABBITMQ=...        USE_REDIS_STREAM=...
SENTRY_DSN=...

# SSO and email
GOOGLE_CLIENT_ID=...  GOOGLE_CLIENT_SECRET=...
MICROSOFT_CLIENT_ID=...  MICROSOFT_CLIENT_SECRET=...  MICROSOFT_TENANT=...
RESEND_API_KEY=...   RESEND_FROM_EMAIL=...
BACKEND_URL=...      FRONTEND_URL=...        # used for OAuth redirects and email links
```

**Frontend** (`apps/frontend/.env.local`)

```
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_AUTH_ENABLED=true     # false disables login and register (marketing or demo mode)
JWT_SECRET=...
STRIPE_SECRET_KEY=...  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...  STRIPE_WEBHOOK_SECRET=...
NEXT_PUBLIC_SENTRY_DSN=...
```

</details>

## Deployment

Production runs on GKE and is provisioned and operated GitOps-style:

1. **Terraform** ([infra/terraform](infra/terraform/README.md)) creates the GKE cluster, node pool and Workload Identity for External Secrets.
2. **Bootstrap add-ons** ([infra/k8s/bootstrap](infra/k8s/bootstrap/README.md)) install ingress-nginx, cert-manager, KEDA and External Secrets Operator.
3. **ArgoCD** ([infra/argocd](infra/argocd/README.md)) watches this repo and applies the Helm chart in [infra/k8s/charts/vivexy](infra/k8s/charts/vivexy). Postgres, Redis, RabbitMQ and MinIO run in-cluster as chart dependencies, and KEDA scales workers on queue depth. Alembic migrations run as a pre-upgrade hook.
4. **CI** ([build-and-push.yml](.github/workflows/build-and-push.yml)) runs tests and `helm lint`, builds images to GHCR, and [update-image-tag.yml](.github/workflows/update-image-tag.yml) commits the new tag back to git for ArgoCD to roll out. CI never touches the cluster directly.

The chart is not cloud-specific. It also installs on any Kubernetes cluster (kind or k3d, EKS, AKS, bare metal), see [infra/k8s/README.md](infra/k8s/README.md). It is published with every release to `oci://ghcr.io/pranavubarhande/charts/vivexy`, so a product can deploy it with its own images and values. For the full walkthrough see [infra/DEPLOYMENT.md](infra/DEPLOYMENT.md), and to verify a deployment run `scripts/smoke-test.py`.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community guidelines. First-time contributors sign the [CLA](CLA.md) on their pull request, and the bot walks you through it. Coding patterns and architectural rules for AI coding agents are in [AGENTS.md](AGENTS.md), and release notes are in [CHANGELOG.md](CHANGELOG.md).

Formatting is enforced by Husky pre-commit hooks (Prettier for JS, TS, JSON, CSS and Markdown, Black and isort for Python). Run `npm run format` and `npm run lint` before you push.

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

GNU AGPL v3.0 or later. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
