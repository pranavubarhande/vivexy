# syntax=docker/dockerfile:1.6

# Production image for the Flask agents-service.
# Same image runs as web (gunicorn) OR as RabbitMQ consumer — override CMD.
# Build context: monorepo root (e.g. `docker build -f infra/docker/agents-service.Dockerfile .`)

FROM python:3.11-slim AS deps
WORKDIR /repo
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

# uv workspace: the root pyproject.toml/uv.lock plus every member's own
# pyproject.toml need to exist at the same relative layout as the repo for
# `uv sync` to resolve the workspace correctly. packages/agents-core also
# needs its real source present (not just pyproject.toml) because it's a
# hatchling src-layout package — building its editable-install wheel metadata
# requires src/agents_core to actually exist.
COPY pyproject.toml uv.lock ./
COPY apps/agents-service/pyproject.toml ./apps/agents-service/pyproject.toml
COPY packages/agents-core/pyproject.toml ./packages/agents-core/pyproject.toml
COPY packages/agents-core/src ./packages/agents-core/src
RUN uv sync --no-dev --frozen
RUN uv pip install gunicorn

FROM python:3.11-slim AS runtime
WORKDIR /repo
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/repo/.venv/bin:${PATH}" \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers \
    HF_HOME=/opt/hf-cache

# System libs:
#  - libpango/cairo/fontconfig — WeasyPrint
#  - libnss3/libatk-bridge/libx*/libgbm — Playwright chromium
#  - pandoc — pypandoc
#  - libpq5 — psycopg2 runtime
#  - tesseract-ocr — OCR for scanned pages in the document store
RUN apt-get update && apt-get install -y --no-install-recommends \
      libpango-1.0-0 libpangoft2-1.0-0 libcairo2 libfontconfig1 \
      libharfbuzz0b libffi8 \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libxkbcommon0 libxcomposite1 \
      libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpangocairo-1.0-0 \
      fonts-liberation fonts-noto-color-emoji \
      pandoc \
      libpq5 \
      tesseract-ocr tesseract-ocr-eng \
      ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd --system --gid 1001 app \
 && useradd --system --uid 1001 --gid app --home /repo app

COPY --from=deps /repo/.venv /repo/.venv
RUN pip install --no-cache-dir uv

# Preserve the same relative layout the venv's editable installs were built
# against (packages/agents-core as a sibling of apps/agents-service, both
# under /repo) — flattening apps/agents-service into /repo would leave the
# editable-install path references in /repo/.venv pointing nowhere.
COPY apps/agents-service ./apps/agents-service
COPY packages/agents-core ./packages/agents-core
RUN chown -R app:app /repo /opt && mkdir -p "$PLAYWRIGHT_BROWSERS_PATH" "$HF_HOME" && chown -R app:app "$PLAYWRIGHT_BROWSERS_PATH" "$HF_HOME"

USER app
WORKDIR /repo/apps/agents-service

# Install Chromium into PLAYWRIGHT_BROWSERS_PATH (best-effort; skip in offline builds)
RUN python -m playwright install chromium || true

# Bake the document embedding model into the image so pods never need to reach
# Hugging Face at runtime (best-effort; skip in offline builds)
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-small-en-v1.5')" || true

EXPOSE 5000

# Default: run as web. Worker overrides with: ["python", "-m", "agents_core.worker.consumer"]
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "4", "--timeout", "120", "--access-logfile", "-", "wsgi:app"]
