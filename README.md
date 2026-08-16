# Vivexy AI workspace template 

A scalable SaaS application for AI agentic workflows, built as a polyglot monorepo.

## Architecture

This monorepo contains:

- **Frontend**: Next.js application (apps/frontend)
- **Backend Services**: Flask-based AI agents service (apps/agents-service)
- **Shared Packages**: Common TypeScript/Python utilities (packages/)
- **Infrastructure**: Docker, deployment configs (infra/)

## Tech Stack

- **Frontend**: Next.js 16, TypeScript, Tailwind CSS
- **Backend**: Flask (Python), LangChain, PostgreSQL
- **Database**: PostgreSQL with SQLAlchemy + Alembic migrations
- **AI**: OpenAI, Anthropic, Google AI, Groq via LangChain
- **Deployment**: Docker, Kubernetes
- **Monorepo**: Turborepo (Node.js), uv (Python)

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+ (preferably from python.org or Homebrew, not system Python)
- Docker & Docker Compose
- UV (for Python dependency management)

#### Installing uv

**macOS (Recommended):**

```bash
# Using Homebrew
brew install uv
```

### Local Development

1. **Clone and setup**:

   ```bash
   git clone https://github.com/pranavubarhande/portfolio-helper-fe.git
   cd portfolio-helper-fe
   ```

2. **Install dependencies**:

   ```bash
   # Install all dependencies (root + all apps)
   npm run install:all

   # Or install individually:
   npm install                    # Root Turborepo
   npm run install:frontend       # Frontend Node.js deps
   npm run install:agents         # Agents Python deps
   ```

3. **Environment setup**:

   ```bash
   # Copy environment files
   cp .env.example .env
   cp apps/frontend/.env.example apps/frontend/.env.local
   cp apps/agents-service/.env.example apps/agents-service/.env
   ```

4. **Database setup**:

   ```bash
   # Run Alembic migrations
   cd apps/agents-service
   uv run alembic upgrade head

   # Seed LLM models
   uv run python scripts/seed_llm_models.py
   cd ../..

   # Seed stock data
   npm run seed-stocks
   ```

5. **Start services**:

   ```bash
   npm run dev  # Starts all services via Turborepo (Next.js + Flask)
   ```

   You'll need local Postgres, Redis, and (optionally) RabbitMQ running on their default ports — install via Homebrew (`brew install postgresql@15 redis rabbitmq`) or your package manager of choice.

6. **Access the application**:
   - Frontend: http://localhost:3000
   - Agents API: http://localhost:5000

### Development Commands

```bash
# Install all dependencies
npm run install:all

# Run all services (interleaved output with prefixes)
npm run dev

# Run individual services (separate terminals for cleaner output)
npm run dev:frontend   # Only Next.js frontend (port 3000)
npm run dev:agents     # Only Flask agents service (port 5000)

# Build all
npm run build

# Testing
npm run test           # Run frontend tests
# For backend tests, navigate to apps/agents-service and run: uv run pytest

# Lint and format
npm run lint
npm run format

# Code Quality
npm run format        # Format code across all apps
npm run format:check  # Check formatting
npm run lint          # Run linting
```

### Python Service Development

```bash
cd apps/agents-service

# Activate virtual environment
uv venv && source .venv/bin/activate

# Run the service
uv run python app.py

# Run tests
uv run pytest
```

### Alembic Migrations

The database schema is managed entirely via Alembic in `apps/agents-service`.

```bash
cd apps/agents-service

# Apply all pending migrations
uv run alembic upgrade head

# Auto-generate a new migration after changing models
uv run alembic revision --autogenerate -m "description_of_change"

# Check current migration version
uv run alembic current

# View migration history
uv run alembic history
```

## Project Structure

```
portfolio-helper-fe/
├── apps/                         # Applications
│   ├── frontend/                 # Next.js UI
│   │   ├── components/           # React components
│   │   ├── services/             # API service clients
│   │   └── scripts/              # Utility scripts
│   └── agents-service/           # Flask AI service
│       ├── app/                  # Flask application
│       │   ├── agents/           # AI agent implementations
│       │   ├── business_logic/   # Business logic layer
│       │   ├── models/           # SQLAlchemy models
│       │   ├── routes/           # API routes
│       │   ├── schemas/          # Pydantic schemas
│       │   ├── services/         # External services
│       │   ├── tools/            # LangChain tools
│       │   └── utils/            # Utilities
│       ├── alembic/              # Database migrations
│       │   └── versions/         # Migration scripts
│       └── scripts/              # Seed scripts (seed_llm_models.py)
├── packages/                     # Shared packages
│   └── shared-types/             # TypeScript types
├── infra/                        # Deployment infrastructure
│   ├── docker/                   # Production Dockerfiles
│   ├── coolify/                  # Cheap path (VPS + managed services)
│   └── aws/                      # Scalable path (Terraform + ECS Fargate)
├── .gitignore
├── package.json                  # Root monorepo config
├── turbo.json                    # Turborepo config
└── README.md
```

## Environment Variables

### Root .env

```
DATABASE_URL=postgresql://user:password@localhost:5432/portfolio_helper
```

### Frontend .env.local

```
NEXT_PUBLIC_API_URL=http://localhost:5000
DATABASE_URL=postgresql://user:password@localhost:5432/portfolio_helper
```

### Agents Service .env

```
DATABASE_URL=postgresql://user:password@localhost:5432/portfolio_helper
OPENAI_API_KEY=your_key
ANTHROPIC_API_KEY=your_key
GOOGLE_AI_API_KEY=your_key
GROQ_API_KEY=your_key
REDIS_URL=redis://localhost:6379
```

## Deployment

Three supported paths — pick whichever matches your scale and ops budget. All three share the same image build pipeline ([.github/workflows/build-and-push.yml](.github/workflows/build-and-push.yml) → GHCR), so switching is a config change, not a rewrite.

| Aspect                 | [Free (demo)](infra/free/README.md) | [Coolify (cheap)](infra/coolify/README.md) | [AWS ECS Fargate (scalable)](infra/aws/README.md) |
| ---------------------- | ----------------------------------- | ------------------------------------------ | ------------------------------------------------- |
| **Cost**               | $0                                  | ~$5–20/mo                                  | ~$200–500/mo                                      |
| **Hosts**              | Vercel + Koyeb                      | VPS + Coolify                              | ECS Fargate + RDS + ElastiCache + MQ              |
| **Stateful services**  | Neon, Upstash, CloudAMQP, R2        | Supabase, Upstash, CloudAMQP, S3           | RDS Multi-AZ, ElastiCache cluster, Amazon MQ, S3  |
| **Cold starts**        | ~30 s (scales to zero)              | None                                       | None                                              |
| **Scaling**            | Single replica ceiling              | Vertical (bigger VPS)                      | Horizontal autoscaling                            |
| **Desktop installers** | GH Releases (unsigned)              | —                                          | —                                                 |
| **Setup time**         | ~30 min                             | ~45 min                                    | ~2 hr                                             |
| **When to pick**       | Demos, OSS forks, pre-launch POC    | Pre-scale, single team, low ops budget     | Spiky traffic, compliance, multi-AZ HA            |

Auto-deploy on push to `main` is wired up for both paths via the workflows in [.github/workflows/](.github/workflows/). Each path has its own README with end-to-end setup, secrets bootstrap, DNS/TLS, and validation steps.

For local development, see the Quick Start section above — use `npm run dev` with Postgres/Redis running natively.

## Code Quality & Formatting

This monorepo uses automated code formatting and pre-commit hooks to maintain consistent code quality.

### Pre-commit Hooks

Pre-commit hooks are automatically set up with Husky and run on every commit:

- **JavaScript/TypeScript**: Prettier formatting
- **Python**: Black (code formatting) and isort (import sorting)

### Manual Formatting

```bash
# Format all code
npm run format

# Check formatting without changes
npm run format:check

# Run linting
npm run lint
```

### Python Formatting

For Python code in `apps/agents-service/`:

```bash
cd apps/agents-service
uv run black .        # Format Python code
uv run isort .        # Sort imports
uv run flake8 .       # Lint Python code
```
