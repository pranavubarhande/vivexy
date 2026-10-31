# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Document store: `/api/documents` uploads PDF, DOCX, TXT, MD and EML files (ZIPs are
  unpacked) for a team or a user, up to 200 files and 100 MB per file by default.
  A background job on the new `document_jobs` queue extracts text page by page,
  runs Tesseract OCR on scanned PDF pages, splits pages into chunks with
  character offsets, embeds them locally with `BAAI/bge-small-en-v1.5` and stores
  the vectors in a per-team Pinecone namespace. Each document reports its status
  (`queued`, `processing`, `ready`, `failed`) and stage. Uploads, deletions and
  reprocessing are recorded in the audit log.
- `VivexyExtension.document_scope_authorizers`: products group documents under
  their own records (e.g. a legal matter) and decide who can access them.
- `WORKER_QUEUES` lets a worker consume only some queues, so document workers can
  run separately from chat workers.
- New dependencies `pypdfium2` and `pytesseract`. The agents-service image
  installs `tesseract-ocr` and bakes in the embedding model.

## [0.3.0] - 2026-10-20

### Added

- Frontend extension points: `AppConfigProvider` / `useAppConfig` let a product
  set the app name, logo, login-page copy, sidebar menu, agent catalogue and
  routes. Every page is available as `@vivexy/core/screens/*`, so a product's
  routes are one-line re-exports.
- `@vivexy/desktop`: the Electron app as a library (`createDesktopApp`,
  `exposeElectronAPI`) with a configurable data namespace and extra tools.
- Backend: `VivexyExtension.include_core_agents` and `default_agent_id` let a
  product offer only its own agents; `get_default_agent_id()` replaces the
  hardcoded `"assistant"`.
- Helm chart is published to `oci://ghcr.io/<owner>/charts/vivexy` with each
  release. New values: `partOf`, `nameOverride`, `agents.wsgiApp`,
  `agents.s3Region` and `migrations.commands`.
- `agents_core.cli`: `seed_llm_models`, `promote_superadmin` and
  `run_maintenance`, runnable as `python -m agents_core.cli.<name>`.
- `agents_core.flask_config.BaseConfig`, shared by the web app, worker and
  scheduler.

### Changed

- `AgentCategory` is a product-defined string instead of a fixed union.
- The root npm workspaces are listed explicitly; `@vivexy/desktop` is installed
  on its own because of Electron.

### Fixed

- Desktop: git commands no longer run through a shell, so `$()` and backticks in
  arguments can't execute.
- Desktop: workspace path checks no longer accept a sibling folder with the same
  prefix (e.g. `/ws-evil` for `/ws`).

### Upgrading

Downstream products can run their own migrations from the Helm chart with
`migrations.commands`. Products that deployed from vivexy's chart need no changes.

## [0.2.0] - 2026-10-20

### Added

- Community health files (CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue/PR
  templates).
- Extension registry (`agents_core.extensions`) so downstream products can add
  tools, agents, endpoints, tables and skills without forking. See
  `docs/EXTENDING.md`.
- Contributor License Agreement (`CLA.md`) enforced on pull requests by a CLA
  bot.
- `@vivexy/core`, `@vivexy/ui` and `vivexy-agents-core` are publishable and
  released together at one shared version, with a release workflow for npm and
  PyPI.
- `packages/agents-core/constraints.txt`: the exact dependency versions vivexy is
  tested with, for downstream products to apply as uv constraints.

### Changed

- Alembic migrations moved into the `agents_core` package. Revision IDs are
  unchanged, so no database change is needed for existing deployments.
- Flask configuration is shared with downstream products via
  `agents_core.flask_config`.
- `agents-core` now depends on `alembic` and caps SQLAlchemy below 2.1.

### Removed

- Stopped tracking the local Redis dump (`dump.rdb`); Redis dumps are now
  git-ignored.

## [0.1.0] - 2025

### Added

- Initial monorepo: Next.js frontend, Flask-based agents service, Electron
  desktop app, Kubernetes/Helm deployment infrastructure.
