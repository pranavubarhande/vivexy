# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
