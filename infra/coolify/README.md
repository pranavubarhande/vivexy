# Deploy with Coolify (cheap path)

One VPS, one Coolify install, three containers. All stateful services
(Postgres / Redis / RabbitMQ / S3) are external managed services. Expected
cost: **$5–20/mo VPS + free tiers** until real traffic shows up.

Pick this path when:

- You're pre-scale (dozens to low thousands of users)
- You want a simple ops story (single dashboard, no IAM, no Terraform)
- You're OK with a single-node failure domain

Pick the AWS path instead ([../aws/README.md](../aws/README.md)) when you
need horizontal DB scaling, multi-AZ HA, or compliance controls.

---

## 1. Provision the VPS

Any provider works. Recommended:

| Provider     | Plan                 | Notes                      |
| ------------ | -------------------- | -------------------------- |
| Hetzner      | CX32 (4 vCPU / 8 GB) | Best value in EU.          |
| DigitalOcean | Premium 4GB / 2 vCPU | US-centric.                |
| Contabo      | VPS S                | Cheapest; overcommits CPU. |

Minimum: **2 vCPU, 4 GB RAM, 40 GB SSD, Ubuntu 22.04/24.04**. Smaller boxes
OOM-kill the agents-service container when Playwright boots.

SSH in as root and install Coolify:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

After install, open `http://<server-ip>:8000`, create your admin user,
and add your server as the default "localhost" target.

## 2. Create managed services

Sign up and capture the connection strings:

| Service   | URL                                                            | What you need                                                      |
| --------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Supabase  | [supabase.com/dashboard](https://supabase.com/dashboard)       | Project → Settings → Database → **Session pooler** URL (port 5432) |
| Upstash   | [console.upstash.com](https://console.upstash.com)             | Redis DB → "TLS/rediss" endpoint + password                        |
| CloudAMQP | [cloudamqp.com](https://www.cloudamqp.com)                     | "Little Lemur" instance → AMQP URL (`amqps://...`)                 |
| AWS S3    | [console.aws.amazon.com/s3](https://console.aws.amazon.com/s3) | Create bucket + IAM user with PutObject/GetObject                  |
| Resend    | [resend.com](https://resend.com)                               | API key for transactional email                                    |
| Sentry    | [sentry.io](https://sentry.io)                                 | DSN for each of `frontend` and `agents-service` projects           |

Paste everything into a local copy of [.env.coolify.example](./.env.coolify.example)
so you have a single source of truth.

## 3. Point DNS at the VPS

In Cloudflare (or your registrar):

```
app.example.com    A    <vps-ip>    Proxy: OFF (during first cert issue)
api.example.com    A    <vps-ip>    Proxy: OFF
```

Flip Cloudflare proxy **ON** only after Coolify successfully issues
Let's Encrypt certs in step 5. Caddy/Traefik need a direct HTTP-01
challenge first.

## 4. Authorise Coolify to pull from GHCR

1. GitHub → Settings → Developer settings → **Personal access tokens** (classic)
2. Create a token with `read:packages` scope, 1-year expiry
3. Coolify → Sources → **Add** → Docker Registry → `ghcr.io`, username = your
   GitHub handle, password = the PAT

## 5. Create the app

1. Coolify → Projects → New → **Docker Compose**
2. Paste the contents of [docker-compose.coolify.yml](./docker-compose.coolify.yml)
3. **Environment Variables**: paste your filled `.env.coolify.example`
4. **Domains**: map `frontend` → `app.example.com`, `agents-service` → `api.example.com`
5. Deploy. First pull + start takes ~3 min.

Coolify's proxy (Traefik) requests Let's Encrypt certs automatically.
Verify with `curl -I https://app.example.com` — you should see a valid cert.

## 6. Run migrations (once)

In the Coolify app → **Terminal** tab on the `agents-service` container:

```bash
uv run alembic upgrade head
uv run python scripts/seed_llm_models.py
```

Re-run `alembic upgrade head` after any schema-changing deploy. To make
this automatic, add it as a Coolify "Pre-Deploy Command" on the
`agents-service` service.

## 7. Wire up auto-deploy from GitHub

1. Coolify → the app → **Webhooks** → copy the deploy webhook URL
2. GitHub repo → Settings → Secrets → add `COOLIFY_WEBHOOK_URL`
3. Every push to `main` now:
   - [build-and-push.yml](../../.github/workflows/build-and-push.yml) builds
     both images and pushes to GHCR
   - [deploy-coolify.yml](../../.github/workflows/deploy-coolify.yml) pings
     the webhook and Coolify pulls the new images

End-to-end (push → live) is usually 4–6 min.

## 8. Staging on the same VPS (optional)

Repeat step 5 with `staging.example.com` / `api.staging.example.com` and a
separate Supabase project. Coolify happily runs both apps side-by-side. When
traffic outgrows one VPS, split prod onto its own server.

---

## Troubleshooting

- **502 from Traefik**: container is crashing. Check the Logs tab —
  9× out of 10 it's a missing env var.
- **SSE chat replies arrive out of order**: `USE_REDIS_STREAM` must be
  `true` whenever there's more than one `agents-service` replica.
- **Chromium fails to launch**: the VPS is too small; upgrade RAM or set
  `SANDBOX_ENABLED=false` and lean on Daytona for sandboxed runs.
- **Certs stuck "pending"**: Cloudflare proxy was ON during issuance.
  Turn it off, redeploy, turn back on once the cert is healthy.
