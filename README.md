# Portfolio Helper Monorepo

A scalable SaaS application for AI agentic workflows, built as a polyglot monorepo.

## Architecture

This monorepo contains:

- **Frontend**: Next.js application (apps/frontend)
- **Backend Services**: Flask-based AI agents service (apps/agents-service)
- **Shared Packages**: Common TypeScript/Python utilities (packages/)
- **Infrastructure**: Docker, deployment configs (infra/)

## Tech Stack

- **Frontend**: Next.js 16, TypeScript, Tailwind CSS, Prisma
- **Backend**: Flask (Python), LangChain, PostgreSQL
- **Database**: PostgreSQL with Prisma ORM
- **AI**: OpenAI, Anthropic, Google AI via LangChain
- **Deployment**: Docker, Kubernetes
- **Monorepo**: Turborepo (Node.js), Poetry (Python)

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+ (preferably from python.org or Homebrew, not system Python)
- Docker & Docker Compose
- Poetry (for Python dependency management)

#### Installing Poetry

**macOS (Recommended):**

````bash
# Using Homebrew
brew install poetry

### Local Development

1. **Clone and setup**:
   ```bash
   git clone https://github.com/pranavubarhande/portfolio-helper-fe.git
   cd portfolio-helper-fe
````

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
   # Generate Prisma client
   npm run pg-generate

   # Run migrations
   npm run pg-migrate

   # Seed data
   npm run seed-stocks
   ```

5. **Start services**:

   ```bash
   # Using Docker Compose (recommended for full isolation)
   cd infra
   docker-compose up -d

   # Or run locally (requires Poetry for Python)
   npm run dev  # Starts all services via Turborepo (Next.js + Flask)
   ```

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

# Lint and format
npm run lint
npm run format

# Database operations
npm run pg-generate
npm run pg-migrate

# Code Quality
npm run format        # Format code across all apps
npm run format:check  # Check formatting
npm run lint          # Run linting
```

### Python Service Development

```bash
cd apps/agents-service

# Activate virtual environment
poetry shell

# Run the service
python app.py

# Run tests
poetry run pytest
```

## Project Structure

```
portfolio-helper/
├── apps/                    # Applications
│   ├── frontend/           # Next.js UI
│   └── agents-service/     # Flask AI service
├── packages/               # Shared packages
│   └── shared-types/       # TypeScript types
├── infra/                  # Infrastructure
│   └── docker-compose.yml
├── prisma/                 # Database schema
├── .gitignore
├── package.json            # Root monorepo config
├── turbo.json              # Turborepo config
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
REDIS_URL=redis://localhost:6379
```

## Deployment

### Docker

```bash
# Build and run
cd infra
docker-compose up --build
```

### Production

1. Set production environment variables
2. Use Kubernetes manifests in `infra/k8s/`
3. Configure load balancer and secrets

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
poetry run black .        # Format Python code
poetry run isort .        # Sort imports
poetry run flake8 .       # Lint Python code
```
