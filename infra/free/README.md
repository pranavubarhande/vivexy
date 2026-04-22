# Deploy on free tiers (demo / POC path)

Zero-cost deployment stitched together from free tiers. Good for demos,
open-source forks, and pre-launch validation. **Not production** — see
the caveats below.

| Component            | Provider                                                      | Free tier                                      |
| -------------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| Frontend             | [Vercel](https://vercel.com) hobby                            | 100 GB bandwidth/mo, auto-deploys from GitHub  |
| Agents-service (web) | [Koyeb](https://www.koyeb.com)                                | 1 web svc, 512 MB, scales to zero              |
| Chat-worker          | [Koyeb](https://www.koyeb.com)                                | 1 worker svc, 512 MB                           |
| Postgres             | [Neon](https://neon.tech)                                     | 500 MB, 191 compute-hrs/mo, autoscales to zero |
| Redis                | [Upstash](https://upstash.com)                                | 256 MB, 10 k commands/day                      |
| RabbitMQ             | [CloudAMQP Little Lemur](https://www.cloudamqp.com)           | 1 M msgs/mo, 20 conns                          |
| Object storage       | [Cloudflare R2](https://dash.cloudflare.com/?to=/:account/r2) | 10 GB, no egress fees                          |
| Browser sandbox      | [Daytona](https://www.daytona.io)                             | Free tier                                      |
| Email                | [Resend](https://resend.com)                                  | 3 k emails/mo                                  |
| Error tracking       | [Sentry](https://sentry.io)                                   | 5 k errors/mo                                  |
| Desktop installers   | GitHub Releases                                               | Unlimited public, 2 GB/file                    |

---

## Caveats — read these first

1. **Koyeb free scales to zero after 5 min idle.** First request after idle
   takes ~30 s cold boot while Flask + deps load. Acceptable for demos,
   annoying for real users.
2. **Neon has 191 compute-hrs/mo** (~6 h active/day). Autoscale handles the
   rest but traffic bursts can exhaust it.
3. **Upstash caps at 10 k Redis commands/day**, shared across frontend +
   agents-service. Burns fast under chat + SSE relay load.
4. **RabbitMQ Little Lemur caps at 20 connections.** The 1 web × 1 worker
   topology uses 2. Fine, but you can't horizontally scale.
5. **Playwright won't fit in 512 MB.** You MUST set `SANDBOX_ENABLED=true`
   so browser work is offloaded to Daytona. Enforced in
   [koyeb.yaml](./koyeb.yaml) — don't remove it.
6. **Desktop installers are unsigned.** First-launch warnings on macOS
   (Gatekeeper) and Windows (SmartScreen). Fine for beta.

If you want any of this to run 24/7 without surprises, use
[infra/coolify](../coolify/README.md) (~$5–20/mo) instead.

---

## 1. Create the managed services

Sign up for each, capture the connection strings. Keep them in a local
copy of [.env.free.example](./.env.free.example) — you'll paste them
into Vercel + Koyeb dashboards next.

| Service   | What to create                              | What to copy                                     |
| --------- | ------------------------------------------- | ------------------------------------------------ |
| Neon      | New project → default branch                | "Pooled connection" URL                          |
| Upstash   | New Redis DB, global                        | `rediss://` URL + host/port/password split       |
| CloudAMQP | "Little Lemur" instance                     | AMQP URL (`amqps://...`)                         |
| S3        | Bucket + API token with read/write          | Endpoint URL + access key + secret + bucket name |
| Daytona   | API key                                     | The key                                          |
| Resend    | API key + (optional) verified domain        | The key                                          |
| Sentry    | Two projects (`frontend`, `agents-service`) | Two DSNs                                         |

## 2. Deploy the frontend to Vercel

1. Vercel → **Add New Project** → import your GitHub repo
2. **Root Directory**: `apps/frontend`
3. **Framework preset**: Next.js (auto-detected)
4. **Build command**: leave default (`turbo build` via repo root)
5. **Environment Variables**: paste every `NEXT_PUBLIC_*` + `NEXTAUTH_*` +
   `STRIPE_*` + `REDIS_*` + `JWT_*` value from `.env.free.example`.
   (`NEXT_PUBLIC_API_URL` you'll fill in after step 3 — revisit then.)
6. Deploy. Vercel auto-deploys every push to `main` going forward.

## 3. Deploy the backend to Koyeb

### 3a. Create a GHCR pull secret

If your GHCR packages are private, you need a PAT so Koyeb can pull them.

1. GitHub → Settings → Developer settings → Personal access tokens
   (classic) → generate with `read:packages` scope, 1-year expiry
2. Koyeb dashboard → **Secrets** → New secret of type **Registry**
   → Name: `ghcr-credentials` → Registry: `ghcr.io` → username: your
   GitHub handle, password: the PAT

### 3b. Create the individual secrets referenced by [koyeb.yaml](./koyeb.yaml)

Koyeb dashboard → **Secrets** → New secret (type: **Simple**) — one per line:

```
ghcr_owner            = <your-github-user-or-org>
database-url          = <Neon pooled URL>
redis-url             = <Upstash rediss:// URL>
rabbitmq-url          = <CloudAMQP amqps:// URL>
flask-secret-key      = <openssl rand -hex 32>
jwt-secret-key        = <openssl rand -hex 32>
openai-api-key        = sk-...
anthropic-api-key     = ...
google-ai-api-key     = ...
groq-api-key          = ...
exa-api-key           = ...
pinecone-api-key      = ...
daytona-api-key       = ...
composio-api-key      = ...  (blank if unused)
sentry-dsn            = https://...
r2-endpoint-url       = https://<account-id>.r2.cloudflarestorage.com
r2-access-key-id      = ...
r2-secret-access-key  = ...
r2-bucket-name        = portfolio-helper
frontend-url          = https://<your>.vercel.app
```

### 3c. Create the two services

Option A — via dashboard:

1. Koyeb → **Create Service** → **Docker** → image:
   `ghcr.io/<your-owner>/portfolio-helper-agents:latest`, credentials:
   `ghcr-credentials`
2. Instance: **Free**, region: **fra** (or closest)
3. For `agents-web`: port 5000, health check `/health`, pre-deploy
   command `uv run alembic upgrade head`, entrypoint
   `gunicorn --bind 0.0.0.0:5000 wsgi:app`
4. For `chat-worker`: type **Worker** (no port), command
   `python -m worker.consumer`
5. Env vars: add every reference from [koyeb.yaml](./koyeb.yaml)
   pointing at the secrets you created

Option B — via CLI (`brew install koyeb/tap/koyeb-cli`):

```bash
koyeb login
cd infra/free
koyeb app create portfolio-helper
# Koyeb doesn't apply koyeb.yaml directly — use it as a reference while
# creating services with `koyeb service create`. The dashboard is faster
# for first-time setup.
```

### 3d. Grab the service URLs

After first deploy, Koyeb gives you two URLs like
`https://agents-web-<org>.koyeb.app`. Go back to Vercel and set
`NEXT_PUBLIC_API_URL` to the agents-web URL, then redeploy the Vercel
project.

## 4. Wire auto-deploy

Push to `main` triggers:

1. [.github/workflows/build-and-push.yml](../../.github/workflows/build-and-push.yml) — builds images → GHCR
2. [.github/workflows/deploy-koyeb.yml](../../.github/workflows/deploy-koyeb.yml) — hits Koyeb redeploy webhooks
3. Vercel's GitHub integration — rebuilds and rolls the frontend

To wire (2):

1. Koyeb → each service → **Settings** → **Redeploy webhook** → copy URL
2. GitHub repo → **Settings → Secrets and variables → Actions**:
   - `KOYEB_AGENTS_REDEPLOY_URL` = agents-web webhook
   - `KOYEB_WORKER_REDEPLOY_URL` = chat-worker webhook

End-to-end (push → live): ~5–8 min (frontend is fast on Vercel, Koyeb
pulls + boots adds 90 s, cold start adds another 30 s on first hit).

## 5. Desktop app releases

Separate workflow, separate trigger:

```bash
git tag desktop-v0.1.0
git push --tags
```

This fires [.github/workflows/desktop-release.yml](../../.github/workflows/desktop-release.yml),
which builds **unsigned** installers for all three OSes in parallel and
uploads to a **draft** GitHub Release. Review the artifacts, then
promote to **published** in the Releases UI.

Config lives in [apps/desktop/electron-builder.yml](../../apps/desktop/electron-builder.yml).
Artifacts produced: `.dmg` (macOS universal), `.exe` NSIS installer,
`.exe` portable (Windows), `.AppImage`, `.deb` (Linux x64).

To promote to **signed** later:

- macOS: add Apple Developer account → set `identity` in electron-builder.yml,
  add `CSC_LINK` + `CSC_KEY_PASSWORD` secrets + `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD`
  for notarization
- Windows: buy an EV code-signing cert, set `CSC_LINK` + `CSC_KEY_PASSWORD`

## 6. Verify

```bash
# Frontend
curl -I https://<your>.vercel.app

# Agents health (may take 30 s on first hit if scaled to zero)
curl https://<agents-web>-<org>.koyeb.app/health

# Worker logs — should show "Worker started — listening on queues"
# Check in Koyeb dashboard → chat-worker → Logs

# End-to-end: open the frontend, start a chat with a file upload,
# confirm SSE stream arrives and the uploaded file appears in R2
```

## Cost ceiling

If any free tier maxes out, upgrading is per-provider:

| Provider  | First paid step                                                 |
| --------- | --------------------------------------------------------------- |
| Vercel    | Pro $20/mo per member when you outgrow 100 GB bandwidth         |
| Koyeb     | Starter $8/mo per service (1 GB RAM) — fixes the 512 MB ceiling |
| Neon      | Launch $19/mo (unlimited compute-hrs)                           |
| Upstash   | $0.20 per 100 k commands after 10 k/day                         |
| CloudAMQP | $19/mo "Tough Tiger" (5 M msgs/mo)                              |
| R2        | $0.015/GB-mo storage past 10 GB — cheap forever                 |

At that point you've matched the [Coolify](../coolify/README.md) path's
economics with worse ergonomics — just switch paths.
