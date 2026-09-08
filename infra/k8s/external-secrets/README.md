# External Secrets — GCP Secret Manager values

The `ExternalSecret` manifests in `prod/` and `staging/` are git-tracked and
declarative, but the real secret *values* they pull from are never
committed — they live in GCP Secret Manager, populated once by hand (or
whenever a value rotates). This replaces re-typing real API keys into
`kubectl create secret` every time a cluster is recreated (see
`../README.md`'s local-dev-only manual flow, kept for kind/k3d which has no
GCP project to talk to).

Each `ExternalSecret` pulls **one JSON blob per Kubernetes Secret** (via
`dataFrom.extract`) rather than one Secret Manager entry per key — four
blobs per environment (`data-credentials`, `agents-secrets`,
`frontend-secrets`) plus one shared `ghcr-credentials` blob, not ~20
individual entries. Keeps rotation and auditing simple: one `gcloud secrets
versions add` per logical secret, not per field.

## Prerequisites

- `infra/terraform/` applied (creates the `eso-secret-manager` GCP service
  account these read via Workload Identity).
- `infra/k8s/bootstrap/external-secrets/` applied (installs ESO, the
  `ClusterSecretStore`).
- `gcloud services enable secretmanager.googleapis.com` (also covered by
  `infra/terraform/README.md`'s one-time setup).

## Populate `agents-secrets` (repeat per environment: `prod`, `staging`)

Real values come from the same local `.env` files already used for the
manual `kubectl create secret` flow — nothing new to type, this just moves
the retyping from "every cluster recreation" to "once, ever."

```bash
cat > /tmp/agents-secrets.json <<'EOF'
{
  "JWT_SECRET_KEY": "...",
  "SECRET_KEY": "...",
  "OPENAI_API_KEY": "...",
  "ANTHROPIC_API_KEY": "...",
  "GOOGLE_AI_API_KEY": "...",
  "GROQ_API_KEY": "...",
  "PINECONE_API_KEY": "...",
  "EXA_API_KEY": "...",
  "DAYTONA_API_KEY": "...",
  "COMPOSIO_API_KEY": "...",
  "SENTRY_DSN": "..."
}
EOF

gcloud secrets create vivexy-prod-agents-secrets --replication-policy=automatic
gcloud secrets versions add vivexy-prod-agents-secrets --data-file=/tmp/agents-secrets.json

rm -P /tmp/agents-secrets.json   # never commit, never leave on disk
```

(For staging: `vivexy-staging-agents-secrets`, and prefer fresh values over
reusing prod's — at minimum for anything DB-adjacent.)

## Populate `data-credentials`

```bash
PG_PW=$(openssl rand -hex 20)
REDIS_PW=$(openssl rand -hex 20)
RABBITMQ_PW=$(openssl rand -hex 20)
REPMGR_PW=$(openssl rand -hex 20)
MINIO_PW=$(openssl rand -hex 20)

cat > /tmp/data-credentials.json <<EOF
{
  "postgres-password": "${PG_PW}",
  "password": "${PG_PW}",
  "repmgr-password": "${REPMGR_PW}",
  "redis-password": "${REDIS_PW}",
  "rabbitmq-password": "${RABBITMQ_PW}",
  "rabbitmq-url": "amqp://user:${RABBITMQ_PW}@vivexy-rabbitmq.vivexy.svc.cluster.local:5672/",
  "minio-root-user": "vivexy",
  "minio-root-password": "${MINIO_PW}",
  "rootUser": "vivexy",
  "rootPassword": "${MINIO_PW}"
}
EOF

gcloud secrets create vivexy-prod-data-credentials --replication-policy=automatic
gcloud secrets versions add vivexy-prod-data-credentials --data-file=/tmp/data-credentials.json
rm -P /tmp/data-credentials.json
```

Same field meanings as documented in `../README.md`'s local-dev flow (the
`password`/`postgres-password` duplication, `repmgr-password`,
`rootUser`/`rootPassword` — all required by the `postgresql-ha`/`minio`
subcharts' fixed key-name expectations). For staging, use a **fresh** set of
random passwords (`vivexy-staging-data-credentials`) — do not reuse prod's
DB passwords, and update `rabbitmq-url`'s namespace to
`vivexy-staging.svc.cluster.local`.

## Populate `frontend-secrets`

```bash
cat > /tmp/frontend-secrets.json <<'EOF'
{
  "NEXTAUTH_SECRET": "...",
  "JWT_SECRET": "...",
  "STRIPE_SECRET_KEY": "...",
  "STRIPE_WEBHOOK_SECRET": "...",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY": "..."
}
EOF

gcloud secrets create vivexy-prod-frontend-secrets --replication-policy=automatic
gcloud secrets versions add vivexy-prod-frontend-secrets --data-file=/tmp/frontend-secrets.json
rm -P /tmp/frontend-secrets.json
```

**Does not include `NEXT_PUBLIC_SENTRY_DSN`** — that var is inlined into the
frontend's client JS bundle at Docker build time, not read at pod runtime
(same mechanism as `NEXT_PUBLIC_API_URL`). It's a GitHub Actions repo
*variable* instead — see the CI workflow and `infra/docker/frontend.Dockerfile`.

## Populate `ghcr-credentials` (shared across environments — populate once)

```bash
kubectl create secret docker-registry ghcr-credentials \
  --docker-server=ghcr.io \
  --docker-username=<gh-username> \
  --docker-password=<gh-pat-with-read:packages> \
  --dry-run=client -o jsonpath='{.data.\.dockerconfigjson}' | base64 -d > /tmp/dockerconfig.json

gcloud secrets create vivexy-ghcr-credentials --replication-policy=automatic
gcloud secrets versions add vivexy-ghcr-credentials --data-file=/tmp/dockerconfig.json
rm -P /tmp/dockerconfig.json
```

## Apply the ExternalSecrets

Once the cluster exists and ArgoCD is bootstrapped (`infra/argocd/`), the
`external-secrets-prod`/`external-secrets-staging` Applications sync these
directories automatically. Before ArgoCD exists, apply by hand:

```bash
kubectl apply -f prod/       # or staging/
kubectl get externalsecret -n vivexy       # STATUS should be SecretSynced
kubectl get secret -n vivexy               # data-credentials, agents-secrets,
                                            # frontend-secrets, ghcr-credentials
                                            # should all now exist
```
