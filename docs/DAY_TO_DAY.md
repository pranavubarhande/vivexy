# Day to day: working on Vivexy

Vivexy is the platform that products such as a legal or finance edition are built on.
Decide where a change belongs before writing it.

| The change is...                                    | Build it in                                           |
| --------------------------------------------------- | ----------------------------------------------------- |
| Generic (a tool, auth, billing, a page, a UI piece) | Vivexy                                                |
| A missing extension point for products              | Vivexy, then release                                  |
| Specific to one product                             | That product's repo, through `agents_core.extensions` |

Never add product-specific tools, agents or routes to Vivexy. See
[EXTENDING.md](EXTENDING.md) for the extension points.

## Daily loop

```bash
npm run dev            # frontend, API, worker and scheduler
npm run test           # vitest + pytest via Turborepo
npm run format         # Prettier, Black and isort
npm run lint
```

Set up the environment once with the [Quick start](../README.md#quick-start). The
[CONTRIBUTING](../CONTRIBUTING.md) checklist lists what to run before a pull request, and
first-time contributors sign the [CLA](../CLA.md) on their PR.

## Database changes

Models and migrations live in `packages/agents-core`.

```bash
cd apps/agents-service
uv run alembic revision --autogenerate -m "describe the change"
uv run alembic upgrade head
```

1. Read the generated file in `packages/agents-core/src/agents_core/migrations/versions`.
   Autogenerate sometimes proposes unrelated changes.
2. Commit the migration with the model change.
3. Products run core migrations first, then their own, so keep migrations
   backwards compatible with the previous release when you can.

## Releasing

Vivexy ships as five things at one shared version: `vivexy-agents-core` (PyPI),
`@vivexy/core`, `@vivexy/ui` and `@vivexy/desktop` (npm), and the Helm chart
(`oci://ghcr.io/<owner>/charts/vivexy`).

1. Bump the version and merge it:
   ```bash
   git checkout main && git pull
   git checkout -b release/0.4.0
   npm run release:version -- 0.4.0   # packages, Chart.yaml, lockfiles, constraints.txt
   ```
   Add the `[0.4.0]` section to `CHANGELOG.md` (rename `[Unreleased]`), commit, open a
   pull request and merge it. Use a merge commit, not a squash, so history stays readable.
2. Go to **Actions > release > Run workflow**, keep the branch as `main`, enter `0.4.0`
   and run it.
3. The workflow checks that every package, the chart and `constraints.txt` are at
   `0.4.0`, creates the tag `v0.4.0` and publishes. It stops with a clear message if you
   run it from another branch, if the version doesn't match the code, or if the tag
   already exists.
4. Verify:
   ```bash
   npm view @vivexy/core version && npm view @vivexy/ui version && npm view @vivexy/desktop version
   curl -s https://pypi.org/pypi/vivexy-agents-core/json | python3 -c "import sys,json;print(json.load(sys.stdin)['info']['version'])"
   helm show chart oci://ghcr.io/<owner>/charts/vivexy --version 0.4.0 | head -3
   ```
5. Upgrade the products. Each one has its own upgrade command (for example
   `python scripts/upgrade_vivexy.py 0.4.0`). Tell product owners about breaking changes
   from the changelog: until 1.0, a minor bump may break extensions.

Pushing a `v*` tag by hand still runs the same publish jobs, but the manual workflow is
the normal path.

### If a release fails

- **A publish job failed.** Fix the cause (a token, a registry setting) and use
  **Re-run failed jobs**. Don't create a new tag: npm never accepts the same version twice.
- **`verify` failed** with a version mismatch. The bump isn't on `main` yet, or
  `constraints.txt` is stale. Fix it through a pull request and run the workflow again.
  If the tag was already created, delete it (`git push --delete origin v0.4.0`) before
  re-running.
- **`@vivexy/desktop` or another package is rejected as new.** The `NPM_TOKEN` must be
  allowed to publish new packages under `@vivexy`.
- **The chart can't be pulled.** Make the `charts/vivexy` package public on GitHub
  (Packages > Package settings > Change visibility), or give ArgoCD credentials for it.

## Deploying

1. Merge to `main`. `build-and-push` runs the tests and `helm lint`, then builds
   `vivexy-agents` and `vivexy-frontend` and pushes them to GHCR.
2. `update-image-tag` commits the new image tag, and ArgoCD rolls it out. A migrations
   Job runs `alembic upgrade head` as part of the sync.
3. After a rollout, run `scripts/smoke-test.py`.

The full walkthrough, including first-time setup, is in
[infra/DEPLOYMENT.md](../infra/DEPLOYMENT.md).

## Troubleshooting

- **`alembic` fails with `Can't load plugin: sqlalchemy.dialects:driver`.** Alembic reads
  `DATABASE_URL` from the environment, not from `.env`. Export it first:
  `set -a; . ./.env; set +a` from `apps/agents-service`.
- **`npm install` fails with `Cannot read properties of null (reading 'edgesOut')`.** That
  is an npm 10 bug with vitest 4's optional peers in a standalone install. Use npm 11
  (`npm i -g npm@11`). `packages/desktop` pins vitest 3 for this reason.
- **A tag push is rejected (HTTP 403) from a restricted environment.** Use the manual
  release workflow instead, which creates the tag itself.
