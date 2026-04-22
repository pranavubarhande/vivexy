# syntax=docker/dockerfile:1.6

# Production image for the Flask agents-service.
# Same image runs as web (gunicorn) OR as RabbitMQ consumer — override CMD.
# Build context: monorepo root (e.g. `docker build -f infra/docker/agents-service.Dockerfile .`)

FROM python:3.11-slim AS deps
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

COPY apps/agents-service/pyproject.toml apps/agents-service/uv.lock ./
RUN uv sync --no-dev --frozen --no-install-project

FROM python:3.11-slim AS runtime
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:${PATH}" \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers

# System libs:
#  - libpango/cairo/fontconfig — WeasyPrint
#  - libnss3/libatk-bridge/libx*/libgbm — Playwright chromium
#  - pandoc — pypandoc
#  - libpq5 — psycopg2 runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
      libpango-1.0-0 libpangoft2-1.0-0 libcairo2 libfontconfig1 \
      libharfbuzz0b libffi8 \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libxkbcommon0 libxcomposite1 \
      libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpangocairo-1.0-0 \
      fonts-liberation fonts-noto-color-emoji \
      pandoc \
      libpq5 \
      ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv gunicorn

# Non-root user
RUN groupadd --system --gid 1001 app \
 && useradd --system --uid 1001 --gid app --home /app app

COPY --from=deps /app/.venv /app/.venv

COPY apps/agents-service /app
RUN chown -R app:app /app /opt && mkdir -p "$PLAYWRIGHT_BROWSERS_PATH" && chown -R app:app "$PLAYWRIGHT_BROWSERS_PATH"

USER app

# Install Chromium into PLAYWRIGHT_BROWSERS_PATH (best-effort; skip in offline builds)
RUN python -m playwright install chromium || true

EXPOSE 5000

# Default: run as web. Worker overrides with: ["python", "-m", "worker.consumer"]
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "4", "--timeout", "120", "--access-logfile", "-", "wsgi:app"]
