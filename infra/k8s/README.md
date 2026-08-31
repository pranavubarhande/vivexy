# Kubernetes deploy — vivexy

Replaces the old `infra/aws` (Terraform/ECS), `infra/coolify`, and
`infra/free` (Koyeb) paths. Postgres, Redis, RabbitMQ, and object storage
(MinIO) now run **inside** the cluster as Helm-managed dependencies of the
`vivexy` chart, rather than as external managed cloud services —
see the chart's `Chart.yaml`/`values.yaml` for the specific subcharts and
the tradeoffs of that choice (documented inline, including the Redis
Sentinel caveat).

## 0. Prerequisites

1. A Kubernetes cluster (any — kind/k3d locally, EKS, GKE, AKS, a bare-metal
   cluster) with a default `StorageClass` that dynamically provisions
   `ReadWriteOnce` PVs — required for Postgres/Redis/RabbitMQ/MinIO
   persistence.
2. Cluster add-ons installed once — see `bootstrap/README.md`
   (ingress-nginx, cert-manager, KEDA).
3. `helm` (v3.14+) and `kubectl` pointed at the target cluster.

## 1. Create the namespace and secrets

Nothing in this chart's `values-*.yaml` files contains a secret — every
secret is a Kubernetes `Secret` created out-of-band and referenced by name
(`secrets.dataCredentials` / `secrets.agents` / `secrets.frontend` in
`values.yaml`). Create the namespace first:

```bash
kubectl create namespace vivexy
```

### `data-credentials` — shared by the app containers AND the postgresql-ha/
redis/rabbitmq/minio subcharts (see `values.yaml`'s comments on how each
subchart's `existingSecret`/`secretKeys` wiring points back at this same
Secret, so the password only needs to be generated once).

```bash
PG_PW=$(openssl rand -hex 20)
REDIS_PW=$(openssl rand -hex 20)
RABBITMQ_PW=$(openssl rand -hex 20)
REPMGR_PW=$(openssl rand -hex 20)
MINIO_USER=vivexy
MINIO_PW=$(openssl rand -hex 20)

kubectl -n vivexy create secret generic data-credentials \
  --from-literal=postgres-password="$PG_PW" \
  --from-literal=password="$PG_PW" \
  --from-literal=repmgr-password="$REPMGR_PW" \
  --from-literal=redis-password="$REDIS_PW" \
  --from-literal=rabbitmq-password="$RABBITMQ_PW" \
  --from-literal=rabbitmq-url="amqp://user:${RABBITMQ_PW}@RELEASE_NAME-rabbitmq.NAMESPACE.svc.cluster.local:5672/" \
  --from-literal=minio-root-user="$MINIO_USER" \
  --from-literal=minio-root-password="$MINIO_PW" \
  --from-literal=rootUser="$MINIO_USER" \
  --from-literal=rootPassword="$MINIO_PW"
```

Replace `RELEASE_NAME` and `NAMESPACE` in `rabbitmq-url` with whatever you
pass as the Helm release name/namespace in step 3 (e.g. `vivexy`/`vivexy`).
This **must** be the fully-qualified `<svc>.<namespace>.svc.cluster.local`
form, not the bare service name — KEDA's operator runs in its own `keda`
namespace, and a bare hostname only resolves within the namespace a pod is
running in. `vivexy-rabbitmq` resolves fine for the app pods (same
namespace) but silently fails DNS lookup from KEDA's operator, which then
never marks the ScaledObject `Ready` (`error establishing connection to
RabbitMQ: ... no such host` in `kubectl describe scaledobject`) — easy to
miss since every application pod stays healthy throughout.

`repmgr-password` and `password` (a duplicate of `postgres-password` — this
chart version has no `secretKeys`-style remapping, see `values.yaml`'s
comments) are required by the `postgresql-ha` subchart's repmgr bootstrap;
`rootUser`/`rootPassword` are duplicates of `minio-root-user`/
`minio-root-password` required by the `minio` subchart's fixed key-name
expectations. Without these, Postgres/MinIO pods fail to start entirely on
a fresh install — see `values.yaml`'s `postgresql-ha:`/`minio:` blocks for
the full explanation of each.

### `agents-secrets` — everything `apps/agents-service/.env.example` lists as
a secret (JWT_SECRET_KEY, SECRET_KEY, per-provider `*_API_KEY`,
`PINECONE_API_KEY`, `DAYTONA_API_KEY`, `COMPOSIO_API_KEY`, `SENTRY_DSN`,
`EXA_API_KEY`, etc — anything you'd normally put in `.env`, minus
`DATABASE_URL`/`REDIS_URL`/`RABBITMQ_URL`/AWS S3 creds, which the chart
composes for you from `data-credentials` + known in-cluster service names,
see `templates/_helpers.tpl`):

```bash
kubectl -n vivexy create secret generic agents-secrets \
  --from-literal=JWT_SECRET_KEY="$(openssl rand -hex 32)" \
  --from-literal=SECRET_KEY="$(openssl rand -hex 32)" \
  --from-literal=OPENAI_API_KEY="..." \
  --from-literal=ANTHROPIC_API_KEY="..." \
  --from-literal=GOOGLE_AI_API_KEY="..." \
  --from-literal=GROQ_API_KEY="..." \
  --from-literal=PINECONE_API_KEY="..." \
  --from-literal=EXA_API_KEY="..." \
  --from-literal=DAYTONA_API_KEY="..." \
  --from-literal=COMPOSIO_API_KEY="..." \
  --from-literal=SENTRY_DSN="..."
```

### `frontend-secrets` — from `apps/frontend/.env.example`:

```bash
kubectl -n vivexy create secret generic frontend-secrets \
  --from-literal=NEXTAUTH_SECRET="$(openssl rand -hex 32)" \
  --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
  --from-literal=STRIPE_SECRET_KEY="..." \
  --from-literal=STRIPE_WEBHOOK_SECRET="..." \
  --from-literal=NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="..."
```

### `ghcr-credentials` — image pull secret for the private GHCR images built
by `.github/workflows/build-and-push.yml`:

```bash
kubectl -n vivexy create secret docker-registry ghcr-credentials \
  --docker-server=ghcr.io \
  --docker-username=<gh-username> \
  --docker-password=<gh-pat-with-read:packages>
```

## 2. Fetch chart dependencies

```bash
cd charts/vivexy
helm dependency update
```

**Before your first install**, verify the pinned Bitnami/MinIO chart
versions in `Chart.yaml` are still resolvable and double-check the
`existingSecret`/`secretKeys` field names referenced in `values.yaml`
against `helm show values` for whatever version actually resolves —
Bitnami's chart distribution and internal schemas have shifted more than
once; the versions and field paths here were current at time of writing but
are exactly the kind of third-party detail worth a quick sanity check
before a real deploy, not something to trust blindly from a comment.

```bash
helm show values oci://registry-1.docker.io/bitnamicharts/postgresql-ha --version <resolved-version>
helm show values oci://registry-1.docker.io/bitnamicharts/redis --version <resolved-version>
helm show values oci://registry-1.docker.io/bitnamicharts/rabbitmq --version <resolved-version>
```

## 3. Install / upgrade

```bash
# Local dev (kind/k3d):
helm upgrade --install vivexy . \
  -f values.yaml -f values-dev.yaml \
  --set image.owner=<your-ghcr-owner> \
  -n vivexy --create-namespace --wait --timeout 10m

# Staging / prod: same shape, different values file + real image tag (CI
# passes --set image.tag=$IMAGE_TAG — see ../../.github/workflows/deploy-k8s.yml)
helm upgrade --install vivexy . \
  -f values.yaml -f values-prod.yaml \
  --set image.owner=<your-ghcr-owner> \
  --set image.tag=<sha-or-tag> \
  -n vivexy --create-namespace --wait --timeout 10m
```

`--wait` blocks until the pre-upgrade Alembic migration Job succeeds and all
Deployments report ready — a failed migration fails the whole `helm upgrade`
instead of rolling forward broken code against an unmigrated schema.

## 4. Validate

```bash
kubectl -n vivexy get pods
kubectl -n vivexy get scaledobject
kubectl -n vivexy get ingress
```

Then the specific chaos checks this whole migration exists to satisfy:

- **Kill a worker pod mid-generation**, confirm RabbitMQ redelivers the
  message to another worker pod (`kubectl -n vivexy delete pod
  -l app.kubernetes.io/name=vivexy-worker --wait=false` while a
  chat is streaming).
- **Scale `agents` to 3+ replicas**, confirm SSE streaming and the
  approval/client-tool flow still work when dispatch and consumption land
  on different pods (they should — see `app/agents/pubsub.py` and
  `app/business_logic/streaming.py`).
- **Kill the Postgres primary pod**, confirm `postgresql-ha`'s repmgr
  promotes a standby and pgpool keeps routing traffic.
