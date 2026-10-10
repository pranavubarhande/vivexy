# Vivexy AI OS Template

[![Build and Push](https://github.com/pranavubarhande/vivexy/actions/workflows/build-and-push.yml/badge.svg)](https://github.com/pranavubarhande/vivexy/actions/workflows/build-and-push.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)

A scalable SaaS platform for AI agentic workflows, built as a polyglot monorepo: a Next.js web app, an Electron desktop app, and a Flask agents service with background workers, deployed to Kubernetes.

## Features

- **Agentic chat** — LangChain/LangGraph agents with streaming (SSE) responses, reasoning/artifact events, human-in-the-loop approvals, and cancellation.
- **Multi-provider LLMs** — OpenAI, Anthropic, Google, Groq, Mistral, Together, Fireworks, and more, with per-model context-window and cost tracking.
- **Domain tools** — web search & crawling, finance/stocks (Yahoo Finance, SEC EDGAR), legal research (CourtListener), compliance (sanctions, audit, regulatory feeds), file handling, and a Daytona code sandbox.
- **RAG** — document ingestion, embeddings, and retrieval (Pinecone, BM25).
- **Skills** — bundled document skills (docx, pdf, pptx, xlsx, data analysis) plus user-defined skills and MCP clients.
- **Artifacts & projects** — generated documents/spreadsheets, projects, GitHub context and checkpoints.
- **Scheduled tasks** — cron-style agent runs executed by a dedicated scheduler and worker.
- **Teams, billing & usage** — team management, Stripe billing, token-usage and cost dashboards.
- **Auth** — email/password with email verification (Resend), plus Google and Microsoft SSO.
- **Desktop app** — Electron wrapper that gives agents local file-system and file-parsing tools over IPC.

## Architecture

```
apps/
  frontend/        Next.js 16 (App Router) web app
  desktop/         Electron app wrapping the static frontend build
  agents-service/  Flask API entrypoint (app factory, config, Alembic migrations)
packages/
  agents-core/     Python: agents, tools, routes, models, business logic, workers
  core/            TypeScript: shared app components, hooks, services (@vivexy/core)
  ui/              TypeScript: shared UI primitives and theme (@vivexy/ui)
infra/             Docker, Helm chart, ArgoCD, Terraform, load tests
```

`apps/agents-service` is a thin Flask shell; nearly all backend logic lives in `packages/agents-core` (a uv workspace member). Chat turns can run in-process or be dispatched through RabbitMQ to workers (`agents_core.worker.consumer`), with Redis used for caching, approvals, client tools, and the SSE relay. The frontend and desktop app share UI through `@vivexy/core` and `@vivexy/ui`.

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, TanStack Query, Vitest
- **Desktop**: Electron, TypeScript, electron-builder
- **Backend**: Flask (Python 3.11+), SQLAlchemy, Alembic, LangChain / LangGraph
- **Data**: PostgreSQL, Redis, RabbitMQ, MinIO/S3, Pinecone
- **Observability**: Sentry, Prometheus/Grafana
- **Infrastructure**: Docker, Kubernetes (Helm), ArgoCD, Terraform (GKE), KEDA
- **Monorepo**: Turborepo + npm workspaces (Node), uv workspace (Python)

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+ (from python.org or Homebrew, not system Python)
- [uv](https://docs.astral.sh/uv/) — `brew install uv` on macOS
- PostgreSQL, Redis (Redis Stack recommended), and optionally RabbitMQ running locally on default ports:
  `brew install postgresql@15 redis rabbitmq`

### Local Development

1. **Clone**:

   ```bash
   git clone https://github.com/pranavubarhande/vivexy.git
   cd vivexy
   ```

2. **Install dependencies** (Node workspaces, Python deps, and Playwright Chromium):

   ```bash
   npm run install:all
   ```

3. **Environment setup**:

   ```bash
   cp apps/frontend/.env.example apps/frontend/.env.local
   cp apps/agents-service/.env.example apps/agents-service/.env
   ```

   Fill in at least `DATABASE_URL`, `JWT_SECRET_KEY`, `SECRET_KEY`, `REDIS_URL`, and one LLM provider key. See [Environment Variables](#environment-variables).

4. **Database setup**:

   ```bash
   cd apps/agents-service
   uv run alembic upgrade head
   uv run python scripts/seed_llm_models.py
   cd ../..
   ```

5. **Start services**:

   ```bash
   npm run dev
   ```

   This runs the Next.js frontend, Flask API, the queue worker, and the scheduler in parallel via Turborepo.

6. **Open the app**:
   - Frontend: http://localhost:3000
   - Agents API: http://localhost:5000 (Swagger UI is served by the API)

### Development Commands

```bash
npm run dev            # Frontend + API + worker + scheduler
npm run dev:frontend   # Next.js only (port 3000)
npm run dev:agents     # Flask API + worker + scheduler (port 5000)
npm run dev:desktop    # Electron app (needs the frontend built; see below)

npm run build          # Build everything
npm run test           # All tests (vitest + pytest) via Turborepo
npm run lint           # ESLint + flake8
npm run format         # Prettier + Black + isort
npm run format:check   # Check formatting without changes
```

### Python Service Development

```bash
cd apps/agents-service
uv run python app.py                     # Run the API
uv run python -m agents_core.worker.consumer    # Run a chat worker
uv run python -m agents_core.worker.scheduler   # Run the scheduled-task scheduler
uv run --extra dev pytest                # Tests for the service

cd ../../packages/agents-core
uv run pytest                            # Tests for the core package
```

### Alembic Migrations

The database schema is managed via Alembic in `apps/agents-service`, with models defined in `packages/agents-core`.

```bash
cd apps/agents-service
uv run alembic upgrade head                                            # Apply migrations
uv run alembic revision --autogenerate -m "description_of_change"      # New migration
uv run alembic current                                                 # Current version
uv run alembic history                                                 # History
```

### Desktop App

```bash
cd apps/desktop
npm run build:all       # Static-export the frontend into renderer/ and compile Electron
npm start               # Launch the app
npm run package:mac     # Or package:win / package:linux
```

Installers are published by the [desktop-release](.github/workflows/desktop-release.yml) workflow when a `desktop-v*` tag is pushed. Builds are currently unsigned.

## Project Structure

```
vivexy/
├── apps/
│   ├── frontend/                 # Next.js app
│   │   ├── app/                  # App Router: login, register, verify-email, auth/callback,
│   │   │                         #   (dashboard)/{chat,dashboard,connectors,scheduled-tasks,
│   │   │                         #   teams,billing,cost-manager,settings}
│   │   └── public/
│   ├── desktop/                  # Electron app
│   │   ├── main.ts, preload.ts   # Main process and context bridge
│   │   └── tools/                # Local file-system / artifact tools exposed over IPC
│   └── agents-service/           # Flask service entrypoint
│       ├── app/                  # App factory; registers blueprints from agents-core
│       ├── configs/              # Flask, worker, and Swagger config
│       ├── alembic/versions/     # Database migrations
│       └── scripts/              # seed_llm_models.py
├── packages/
│   ├── agents-core/src/agents_core/
│   │   ├── agents/               # Agent factory, LLM factory, MCP client, approvals, pubsub
│   │   ├── routes/               # API blueprints (chat, auth, teams, stripe, rag, ...)
│   │   ├── business_logic/       # Business logic layer
│   │   ├── models/               # SQLAlchemy models
│   │   ├── schemas/              # Pydantic schemas
│   │   ├── tools/                # LangChain tools (web, stocks, finance, legal,
│   │   │                         #   compliance, rag, files, sandbox)
│   │   ├── skills/               # Bundled skills (docx, pdf, pptx, xlsx, data-analysis)
│   │   ├── services/             # S3, RAG, file processing
│   │   └── worker/               # Queue consumer, dispatcher, scheduler
│   ├── core/                     # @vivexy/core — shared TS components, hooks, services
│   └── ui/                       # @vivexy/ui — shared UI primitives and theme
├── infra/
│   ├── docker/                   # Production Dockerfiles
│   ├── k8s/                      # Helm chart, bootstrap add-ons, external-secrets, observability
│   ├── argocd/                   # GitOps application manifests
│   ├── terraform/                # GKE cluster + Workload Identity
│   └── load-tests/               # Chat and registration load tests
├── scripts/smoke-test.py         # Post-deploy smoke test
├── docs/superpowers/             # Design specs and implementation plans
├── package.json                  # Root monorepo config
├── pyproject.toml                # uv workspace (agents-service, agents-core)
└── turbo.json                    # Turborepo config
```

## Environment Variables

The `.env.example` files are the source of truth; the main groups are:

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
NEXT_PUBLIC_AUTH_ENABLED=true     # false disables login/register (marketing/demo mode)
JWT_SECRET=...
STRIPE_SECRET_KEY=...  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...  STRIPE_WEBHOOK_SECRET=...
NEXT_PUBLIC_SENTRY_DSN=...
```

## Deployment

Production runs on GKE, provisioned and operated GitOps-style:

1. **Terraform** ([infra/terraform](infra/terraform/README.md)) creates the GKE cluster, node pool, and Workload Identity for External Secrets.
2. **Bootstrap add-ons** ([infra/k8s/bootstrap](infra/k8s/bootstrap/README.md)) install ingress-nginx, cert-manager, KEDA, and External Secrets Operator.
3. **ArgoCD** ([infra/argocd](infra/argocd/README.md)) watches this repo and applies the Helm chart in [infra/k8s/charts/vivexy](infra/k8s/charts/vivexy). Postgres, Redis, RabbitMQ, and MinIO run in-cluster as chart dependencies; KEDA scales workers on queue depth. Alembic migrations run as a pre-upgrade hook.
4. **CI** ([build-and-push.yml](.github/workflows/build-and-push.yml)) runs tests and `helm lint`, builds images to GHCR, and [update-image-tag.yml](.github/workflows/update-image-tag.yml) commits the new tag back to git for ArgoCD to roll out. CI never touches the cluster directly.

The chart itself is not cloud-specific and also installs on any Kubernetes cluster (kind/k3d, EKS, AKS, bare metal) — see [infra/k8s/README.md](infra/k8s/README.md). For the full end-to-end walkthrough see [infra/DEPLOYMENT.md](infra/DEPLOYMENT.md); to verify a deployment run `scripts/smoke-test.py`.

## Code Quality & Formatting

Husky pre-commit hooks run lint-staged on every commit:

- **JavaScript/TypeScript/JSON/CSS/Markdown**: Prettier
- **Python**: Black and isort

```bash
npm run format         # Format all code
npm run format:check   # Check without changes
npm run lint           # ESLint + flake8

# Python only
cd apps/agents-service
uv run --extra dev black .
uv run --extra dev isort .
uv run --extra dev flake8 .
```

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community guidelines. Coding patterns and architectural rules for AI coding agents are in [AGENTS.md](AGENTS.md); release notes are in [CHANGELOG.md](CHANGELOG.md).

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

GNU AGPL v3.0 or later — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
