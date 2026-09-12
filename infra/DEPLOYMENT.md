# Production deployment — end to end

A from-scratch walkthrough for standing up `vivexy` on GKE the way this
project actually does it: Terraform for the cluster, ArgoCD for GitOps,
GCP Secret Manager + External Secrets Operator for secrets, GitHub Actions
for building images and writing the deployed tag back to git. Written for
someone who has never touched this repo's infra before.

Every command below assumes you're in the repo root unless noted, and that
`gcloud`, `kubectl`, `helm` (v3.14+), and `terraform` are installed and
`gcloud auth login` has already run. `gh` (GitHub CLI) and the `argocd` CLI
are optional but used in the troubleshooting section.

## Architecture in one paragraph

One GKE cluster (Terraform-managed) runs everything: the app's own
`agents-service` (Flask API + SSE streaming) and `frontend` (Next.js)
images, plus Postgres-HA/Redis/RabbitMQ/MinIO as in-cluster Helm
subcharts (no external managed databases). ArgoCD watches this git repo
and is the *only* thing that ever runs `helm upgrade` against the
cluster — CI never touches the cluster directly, it only builds images
and commits the resulting tag back to git, which ArgoCD then picks up.
Real secret values live in GCP Secret Manager and get projected into the
cluster by External Secrets Operator (ESO) via Workload Identity — no
service-account key files, nothing sensitive in git or Terraform state.
KEDA autoscales the background worker on RabbitMQ queue depth; GKE
Managed Prometheus + Grafana handle observability.

## Prerequisites (one-time, per GCP project)

1. A GCP project with billing enabled.
2. A domain, or none — this guide uses [sslip.io](https://sslip.io) (a
   wildcard DNS service that resolves `<anything>.<IP>.sslip.io` to `<IP>`
   literally) so you can get real, trusted TLS without owning a domain.
   Fine for testing/personal use; swap in a real domain by changing the
   hostnames below and this part becomes irrelevant.
3. Enable the required APIs and create the Terraform state bucket:

   ```bash
   gcloud config set project <PROJECT_ID>
   gcloud services enable \
     container.googleapis.com \
     iam.googleapis.com \
     secretmanager.googleapis.com \
     monitoring.googleapis.com

   gcloud storage buckets create gs://<PROJECT_ID>-tfstate --location=<region>
   ```

4. `gcloud auth application-default login` — Terraform needs Application
   Default Credentials, which is a *separate* credential store from your
   regular `gcloud auth login` session.

## Step 1 — Terraform: the cluster

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars: project_id, zone at minimum

terraform init -backend-config="bucket=<PROJECT_ID>-tfstate"
terraform plan -out=tfplan
terraform apply "tfplan"

gcloud container clusters get-credentials "$(terraform output -raw cluster_name)" \
  --zone "$(terraform output -raw zone)" --project "$(terraform output -raw project_id)"
terraform output -raw eso_gsa_email   # keep this — Step 3 needs it
```

If the very first `apply` fails on the Workload Identity IAM binding with
`Identity Pool does not exist`, just re-run `terraform apply` — the pool
takes a minute to propagate after the cluster is created, and this is a
one-time transient failure, not a real problem.

**Sizing note**: `node_disk_size_gb` (default 50) and the node pool's
`node_min_count`/`node_max_count` directly trade off against your
project's regional `SSD_TOTAL_GB` quota (a default GCP project gets
500GB) — see [Troubleshooting → disk quota](#disk-quota-vs-node-count)
before changing these on a quota-constrained project.

## Step 2 — Bootstrap cluster add-ons

One-time per cluster (see `infra/k8s/bootstrap/README.md` for the full
detail). In order:

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo add jetstack https://charts.jetstack.io
helm repo add kedacore https://kedacore.github.io/charts
helm repo add external-secrets https://charts.external-secrets.io
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update

helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace

helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace --set crds.enabled=true

helm install keda kedacore/keda --namespace keda --create-namespace

helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets --create-namespace
```

Apply the ClusterIssuers (edit the email first — Let's Encrypt uses it for
expiry notices):

```bash
sed 's/CHANGE_ME@example.com/you@example.com/' infra/k8s/bootstrap/cluster-issuer.yaml | kubectl apply -f -
```

Wire up External Secrets Operator to GCP Secret Manager via Workload
Identity (no key files):

```bash
sed 's/<PROJECT_ID>/<PROJECT_ID>/' infra/k8s/bootstrap/external-secrets/service-account.yaml | kubectl apply -f -
sed -e 's/<PROJECT_ID>/<PROJECT_ID>/' -e 's/<ZONE>/<ZONE>/' -e 's/<CLUSTER_NAME>/<CLUSTER_NAME>/' \
  infra/k8s/bootstrap/external-secrets/cluster-secret-store.yaml | kubectl apply -f -

kubectl get clustersecretstore gcp-secret-manager   # should report Ready=True within ~30s
```

(The `service-account.yaml` annotation must exactly equal the
`eso_gsa_email` Terraform output from Step 1.)

## Step 3 — Populate real secrets in GCP Secret Manager

Real values never touch git or Terraform state — see
`infra/k8s/external-secrets/README.md` for the exact JSON shape of each
of the four secrets (`data-credentials`, `agents-secrets`,
`frontend-secrets`, `ghcr-credentials`). Short version:

```bash
gcloud secrets create vivexy-prod-data-credentials --replication-policy=automatic
gcloud secrets versions add vivexy-prod-data-credentials --data-file=/tmp/data-credentials.json

gcloud secrets create vivexy-prod-agents-secrets --replication-policy=automatic
gcloud secrets versions add vivexy-prod-agents-secrets --data-file=/tmp/agents-secrets.json

gcloud secrets create vivexy-prod-frontend-secrets --replication-policy=automatic
gcloud secrets versions add vivexy-prod-frontend-secrets --data-file=/tmp/frontend-secrets.json

gcloud secrets create vivexy-ghcr-credentials --replication-policy=automatic
gcloud secrets versions add vivexy-ghcr-credentials --data-file=/tmp/dockerconfig.json

rm -P /tmp/*.json   # never leave these on disk
```

`agents-secrets` needs real API keys for **at least Google (Gemini) or
Groq** to get a working chat model out of the box — see
[Troubleshooting → only some providers are seeded with real
keys](#only-some-model-providers-work) for why the model dropdown will
show ~130 models but most of them will fail without keys you add
yourself.

## Step 4 — ArgoCD

```bash
helm install argocd argo/argo-cd --namespace argocd --create-namespace

kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d   # save this, one-time retrieval

kubectl apply -f infra/argocd/bootstrap/root-app.yaml   # the ONE manifest ever applied by hand
```

`root-app.yaml` is an "app of apps": from here, every `Application` under
`infra/argocd/apps/` gets created and kept in sync automatically —
`vivexy-prod`, `external-secrets-prod`, `grafana`,
`observability-manifests`. Watch it converge:

```bash
kubectl get application -n argocd
# everything should reach Synced/Healthy within a few minutes
```

`vivexy-staging` and `external-secrets-staging` are intentionally **not**
in `apps/` — they live in `infra/argocd/apps-disabled/` because running
both environments on a small/quota-constrained project starves prod (see
[Troubleshooting](#disk-quota-vs-node-count)). Move them back into `apps/`
to re-enable staging once you have real headroom.

## Step 5 — Point the ingress at a real hostname

Get the ingress-nginx LoadBalancer's external IP:

```bash
kubectl get svc -n ingress-nginx ingress-nginx-controller \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

Using sslip.io (skip if you have a real domain — just use that instead):
edit `infra/k8s/charts/vivexy/values-prod.yaml`'s `ingress.frontendHost` /
`ingress.apiHost` and the matching `frontend.env.NEXT_PUBLIC_*` /
`agents.env.CORS_ORIGINS` values to `<IP-with-dashes>.sslip.io` /
`api.<IP-with-dashes>.sslip.io` (e.g. `35-232-92-129.sslip.io`), commit,
push.

**This IP changes every time the cluster (or just the node pool) is torn
down and recreated** — see
[Troubleshooting](#stale-ingress-ip-after-a-cluster-recreate) for the full
knock-on effects (broken TLS issuance, unreachable API) if you forget
this step after a rebuild.

## Step 6 — GitHub Actions: image build + repo variables

Set the repo variables the frontend's Docker build bakes in
(`NEXT_PUBLIC_*` vars are compiled into the client JS bundle at build
time, not read at pod runtime):

```bash
gh variable set NEXT_PUBLIC_API_URL --body "https://api.<host>"
gh variable set NEXT_PUBLIC_APP_URL --body "https://<host>"
gh variable set NEXT_PUBLIC_AUTH_ENABLED --body "true"
gh variable set NEXT_PUBLIC_SENTRY_DSN --body "<your Sentry DSN, or skip if you don't use Sentry>"
```

Push to `main` (or `workflow_dispatch`) to trigger `build-and-push.yml`.
On success, `update-image-tag.yml` writes the built image's `sha-<commit>`
tag into `infra/k8s/charts/vivexy/image-tag/prod.yaml` and commits it —
that commit is what ArgoCD actually reacts to; nothing in CI ever runs
`kubectl`/`helm` against the cluster.

```bash
gh run watch --exit-status   # or: gh run list --workflow=build-and-push.yml
```

## Step 7 — Verify

```bash
kubectl get application -n argocd          # all Synced/Healthy
kubectl get pods -n vivexy                 # all Running
curl -sk https://api.<host>/health         # 200
curl -sk https://<host>/                   # 200, valid cert

python scripts/smoke-test.py               # full register→login→chat→SSE-stream flow
# SMOKE_TEST_BASE_URL=https://api.<host> python scripts/smoke-test.py
```

The migrations Job (an ArgoCD PostSync hook) runs `alembic upgrade head`
then `scripts/seed_llm_models.py` on every sync — a fresh database gets
its schema *and* a populated model catalog automatically, no manual step.

## Step 8 — Observability

```bash
kubectl -n monitoring get secret grafana -o jsonpath='{.data.admin-password}' | base64 -d
kubectl -n monitoring port-forward svc/grafana 3000:80
# http://localhost:3000, username "admin" — "GKE Managed Prometheus" datasource is pre-wired
```

---

## Day-2 operations

**Deploy a code change**: just merge to `main`. CI builds, writes the tag,
ArgoCD picks it up within its ~3-minute poll (or force it — see below).
Nothing to run by hand.

**Force an immediate ArgoCD sync** (don't wait for the poll):

```bash
kubectl annotate application vivexy-prod -n argocd argocd.argoproj.io/refresh=hard --overwrite
```

**Tear down** (keeps the GCP project, the Terraform state bucket, and
Secret Manager secrets — next `terraform apply` rebuilds everything else
from scratch):

```bash
cd infra/terraform
terraform destroy
```

`terraform destroy` does **not** delete orphaned disks left behind by
PVCs — the GCE persistent disks backing Postgres/Redis/RabbitMQ/MinIO
volumes survive the cluster's deletion by design (so you don't lose data
if you only meant to replace the node pool). If you really are done and
want zero ongoing cost, also run:

```bash
gcloud compute disks list   # anything left with no attached instance is now orphaned
gcloud compute disks delete <name> --zone=<zone> --quiet
```

**Resize the node pool** (e.g. to add headroom):

```bash
gcloud container clusters resize <cluster> --node-pool <pool> --num-nodes=<n> --zone <zone>
```

Bypasses the cluster autoscaler entirely — useful when the autoscaler is
stuck in a backoff (see below) and you need relief *now*, not after its
own retry timer expires.

---

## Troubleshooting — real problems hit building this

These are all things that actually happened setting this up, not
hypotheticals — kept here so the next person (or the next you) doesn't
have to rediscover them from scratch.

### Postgres-HA `repmgr` first-boot race

**Symptom**: `postgresql-ha-postgresql-0` crash-loops right after a fresh
install or a PVC-losing event (new node pool, deleted PVC), with logs
showing `password authentication failed for user "repmgr"` / `Role
"repmgr" does not exist`. The bitnami postgresql-ha chart's own bootstrap
entrypoint occasionally loses the race between `initdb` and the
repmgr-specific role/database/extension/node-registration setup on a
genuinely fresh data directory.

**Fix** — a manual surgical procedure, since there's no clean chart-level
fix as of this writing:

```bash
# 1. Stop the normal entrypoint from fighting you while you work
kubectl patch statefulset vivexy-prod-postgresql-ha-postgresql -n vivexy --type=json -p '[
  {"op":"add","path":"/spec/template/spec/containers/0/command","value":["sleep"]},
  {"op":"add","path":"/spec/template/spec/containers/0/args","value":["infinity"]}
]'
kubectl delete pod vivexy-prod-postgresql-ha-postgresql-0 -n vivexy --wait=false
# wait for it to reach Running (with sleep infinity, not the real entrypoint)

# 2. Manually start postgres
kubectl exec -n vivexy vivexy-prod-postgresql-ha-postgresql-0 -c postgresql -- chmod 0700 /bitnami/postgresql/data
kubectl exec -n vivexy vivexy-prod-postgresql-ha-postgresql-0 -c postgresql -- \
  pg_ctl -D /bitnami/postgresql/data -o "-c config_file=/bitnami/postgresql/conf/postgresql.conf -c hba_file=/bitnami/postgresql/conf/pg_hba.conf -c listen_addresses=* -c port=5432" -w start
# if this errors with "could not open configuration directory .../conf.d":
#   kubectl exec ... -- mkdir -p /bitnami/postgresql/conf/conf.d   then retry

# 3. Create what the bootstrap missed (fetch REPMGR_PW/POSTGRES_PW from the
#    data-credentials secret first)
kubectl exec -n vivexy vivexy-prod-postgresql-ha-postgresql-0 -c postgresql -- \
  psql -U postgres -d postgres -c "CREATE ROLE repmgr WITH LOGIN SUPERUSER PASSWORD '<REPMGR_PW>';"
kubectl exec -n vivexy vivexy-prod-postgresql-ha-postgresql-0 -c postgresql -- \
  psql -U postgres -d postgres -c "CREATE DATABASE repmgr OWNER repmgr;"
kubectl exec -n vivexy vivexy-prod-postgresql-ha-postgresql-0 -c postgresql -- \
  psql -U postgres -d repmgr -c "CREATE EXTENSION IF NOT EXISTS repmgr;"
kubectl exec -n vivexy vivexy-prod-postgresql-ha-postgresql-0 -c postgresql -- \
  psql -U postgres -d repmgr -c "INSERT INTO repmgr.nodes (node_id, upstream_node_id, active, node_name, type, location, priority, conninfo, repluser, config_file) VALUES (1000, NULL, TRUE, 'vivexy-prod-postgresql-ha-postgresql-0', 'primary', 'default', 100, 'host=vivexy-prod-postgresql-ha-postgresql-0.vivexy-prod-postgresql-ha-postgresql-headless.vivexy.svc.cluster.local port=5432 user=repmgr dbname=repmgr connect_timeout=5', 'repmgr', '/opt/bitnami/repmgr/conf/repmgr.conf');"
# node_id convention: pod ordinal + 1000 (ordinal 0 -> 1000, ordinal 1 -> 1001, ...)

# also verify/fix the postgres superuser password the same way if needed:
kubectl exec -n vivexy vivexy-prod-postgresql-ha-postgresql-0 -c postgresql -- \
  psql -U postgres -d postgres -c "ALTER ROLE postgres PASSWORD '<POSTGRES_PW>';"

# 4. Clean up and revert
kubectl exec -n vivexy vivexy-prod-postgresql-ha-postgresql-0 -c postgresql -- pg_ctl -D /bitnami/postgresql/data stop -m fast
kubectl patch statefulset vivexy-prod-postgresql-ha-postgresql -n vivexy --type=json -p '[
  {"op":"remove","path":"/spec/template/spec/containers/0/command"},
  {"op":"remove","path":"/spec/template/spec/containers/0/args"}
]'
kubectl delete pod vivexy-prod-postgresql-ha-postgresql-0 -n vivexy --wait=false
```

### Disk quota vs. node count

A default GCP project's regional `SSD_TOTAL_GB` quota is 500GB. Every GKE
node's boot disk counts against it, on top of every PVC (Postgres,
Redis, RabbitMQ, MinIO). At the chart's stock settings (100GB default
boot disks, MinIO's 50Gi-per-replica default × 4 replicas), a 4-node
cluster alone can consume the *entire* quota before a single app PVC
provisions — symptom: `ProvisioningFailed` events with `QUOTA_EXCEEDED:
Quota 'SSD_TOTAL_GB' exceeded`.

Levers, roughly in order of impact:
- `node_disk_size_gb` in Terraform (this repo settled on 50GB — 30GB was
  tried first and caused `DiskPressure` evictions once several service
  images were pulled onto a node; 50GB has held up fine).
- `minio.persistence.size` (chart default 50Gi/replica is oversized for a
  small deployment; this repo overrides it via an ArgoCD `Application`
  Helm `parameters:` entry rather than editing `values-prod.yaml`, so the
  values file keeps representing genuine production shape).
- Real fix if you outgrow this: request an `SSD_TOTAL_GB` quota increase
  from GCP, or size individual PVCs down further.

Related: `cluster-autoscaler` remembers a failed scale-up (e.g. from a
disk-quota error) and enters a backoff that can last up to ~30 minutes
before retrying on its own. If you've just freed quota and need relief
now rather than waiting it out, resize the node pool manually (see Day-2
ops above) — that bypasses the autoscaler's own backoff entirely.

### HPA / node-capacity feedback loop

**Symptom**: a Deployment's pods cycle through
`CrashLoopBackOff`/restarts even though steady-state CPU usage is low
(HPA shows e.g. `3%/60%` but is still holding a high replica count). This
is a real feedback loop, not a metrics glitch: a capacity-starved node
causes slow health-check responses → readiness/liveness probe timeouts →
kubelet restarts the container → the restart itself is a CPU burst → HPA
samples that burst and keeps/raises its replica recommendation → worse
contention → repeat. `kubectl describe hpa` will show `AbleToScale:
ScaleDownStabilized` holding a stale high recommendation.

**Fix**: add real node capacity (see Day-2 ops' manual resize) rather
than fighting the HPA directly — a manual `kubectl scale` down gets
partially overridden by HPA's own stabilization window anyway. Once
there's genuine headroom, the loop breaks on its own within a couple of
scheduling cycles.

### ArgoCD sync operations get stuck in `Running` forever

**Symptom**: `kubectl get application -n argocd` shows `OutOfSync`, but
`selfHeal: true` never triggers a fresh sync — `.status.operationState`
is stuck at `phase: Running` from an operation that started a long time
ago and never finished (often because it was waiting on a resource that
can now never become healthy, e.g. the repmgr race above).

**Fix**:

```bash
kubectl port-forward svc/argocd-server -n argocd 8443:443 &
argocd login localhost:8443 --username admin --password "$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d)" --insecure

argocd app terminate-op vivexy-prod
argocd app sync vivexy-prod --force
```

If `terminate-op` itself errors, or the CLI reports `another operation is
already in progress`, clear the stuck operation directly:

```bash
kubectl patch application vivexy-prod -n argocd --type merge -p '{"operation":null}'
```

### Deleting a staging `Application` doesn't delete its resources

ArgoCD `Application` objects don't cascade-delete the resources they
manage unless the manifest carries the
`resources-finalizer.argocd.argoproj.io` finalizer. This repo's
`apps-disabled/` pattern (move a file out of `apps/` to stop managing it)
relies on ArgoCD pruning the `Application` object itself, but that alone
leaves every Deployment/StatefulSet/PVC it created running, unmanaged,
forever — silently consuming CPU/disk/quota. If you disable an
environment this way, also manually delete its namespace:

```bash
kubectl delete namespace vivexy-staging
```

(If it hangs in `Terminating`, check for a stuck finalizer —
`kubectl get <resource> -n vivexy-staging -o json | jq '.items[].metadata.finalizers'`
— and clear it with `kubectl patch <resource> ... --type=merge -p
'{"metadata":{"finalizers":[]}}'`, KEDA's `finalizer.keda.sh` on
`ScaledObject`s being the one actually hit here.)

### Grafana stuck `Degraded` with a phantom pod in `Init:0/1`

**Symptom**: the `grafana` Application never leaves `Degraded`, and
`kubectl get pods -n monitoring` shows two Grafana pods — an old one
`Running` and a new one wedged in `Init:0/1` indefinitely, no useful
events.

**Cause**: a single-replica Deployment backed by a `ReadWriteOnce` PVC
can never complete a `RollingUpdate` — the new pod's init container can't
mount the same RWO volume while the old pod still holds it, and
`RollingUpdate` won't kill the old pod until the new one is `Ready`.
Permanent deadlock.

**Fix**: set `deploymentStrategy.type: Recreate` in
`infra/argocd/apps/grafana.yaml`'s `helm.valuesObject` (supported
natively by the upstream `grafana/grafana` chart), then manually delete
the currently-stuck pod once to break the existing deadlock — the
strategy fix alone doesn't retroactively unstick an already-wedged
rollout.

### Stale ingress IP after a cluster (or node pool) recreate

If you tear down and rebuild the cluster, ingress-nginx's LoadBalancer
gets a **new** external IP. Since sslip.io hostnames encode the IP
literally, any `values-prod.yaml`/GitHub-variable references to the old
IP now point nowhere — symptom: cert-manager's HTTP-01 challenges fail
indefinitely (`Certificate` stuck `Ready=False` for hours) and the API/
frontend are externally unreachable, even though every pod inside the
cluster is perfectly healthy. Re-run Step 5 above with the new IP, and
rebuild the frontend image (its `NEXT_PUBLIC_*` URLs are baked in at
Docker build time, so a values/variable change alone doesn't fix an
already-built image).

### Only some model providers work out of the box

`scripts/seed_llm_models.py` (run automatically by the migrations Job)
seeds ~130 models across ten providers (OpenAI, Anthropic, Google, Groq,
Mistral, Together, Fireworks, Cohere, xAI, Ollama) into the chat model
selector — regardless of which provider API keys you've actually put in
`agents-secrets`. Selecting a model whose provider has no real key (or a
placeholder) fails with `"Invalid or missing API key for this
provider"` the moment you send a message, even though registration,
login, and the rest of the app work fine. This is expected, not a bug —
add real keys for whichever providers you want to actually use, or ignore
the ones you don't.

### CI: `npm ci` fails with `uv: not found`

`apps/agents-service/package.json` has an `"install": "uv sync"` script
— npm treats a script literally named `install` as a lifecycle hook and
runs it automatically as part of `npm ci` across the whole workspace. If
your CI workflow installs `uv` *after* `npm ci`, this fails on every run.
Fix: install `uv` (`astral-sh/setup-uv@v3` or equivalent) before running
`npm ci`, not after.

### Worker crashes whenever RabbitMQ restarts

`worker/consumer.py`'s shutdown path used to call `connection.close()`
unconditionally in a `finally` block. When RabbitMQ force-closes the
connection (e.g. its own pod restarting), pika already raises
`ConnectionClosedByBroker`, and closing an already-closed connection
raises a second, unhandled `ConnectionWrongStateError` that crashes the
whole process — masking the real cause behind a confusing secondary
exception every time rabbitmq cycled. Fixed by guarding the close with
`if connection.is_open:` — but the underlying lesson generalizes: any
cleanup/`finally` block reacting to a connection-closed error needs to
check the connection's actual state before trying to close it again.
