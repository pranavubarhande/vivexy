# Contributing to Vivexy

Thanks for your interest in contributing. This document covers the workflow for
proposing changes to this repo.

## Getting set up

Follow the [Quick Start](README.md#quick-start) in the README to install
dependencies and run the app locally.

## Branching and commits

- Branch off `main` using a short, descriptive name (e.g. `feat/scheduled-tasks`,
  `fix/chat-stream-retry`).
- Keep commits focused; write commit messages that explain *why* a change was
  made, not just what changed.

## Before opening a pull request

```bash
npm run lint
npm run format:check
npm run test           # frontend tests

cd apps/agents-service
uv run pytest          # backend tests
uv run black --check . && uv run isort --check-only . && uv run flake8 .
```

Pre-commit hooks (Husky) run Prettier, Black, and isort automatically, but it's
worth running the checks above yourself before pushing.

## Opening a pull request

- Fill out the PR template — describe what changed and why, and how you tested it.
- Link any related issue.
- Keep PRs scoped to one change; large unrelated changes are harder to review
  and slower to merge.
- A maintainer will review and may ask for changes before merging.

## Reporting bugs / requesting features

Use the issue templates under **New Issue**. Include reproduction steps for
bugs, and the problem you're trying to solve (not just the solution) for
feature requests.

## Code of Conduct

By participating in this project, you agree to abide by the
[Code of Conduct](CODE_OF_CONDUCT.md).
