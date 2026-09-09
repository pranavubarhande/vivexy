# Cluster bootstrap (one-time, per cluster)

These are cluster-scoped add-ons the `vivexy` app chart depends on
but does not install itself — CRDs and cluster-wide operators don't belong
inside an application chart's lifecycle (installing/upgrading/uninstalling
the app release shouldn't touch them). Run this once per cluster, before the
first `helm install` of the app chart (see `../README.md`).

Any cloud-agnostic Kubernetes cluster works (kind/k3d locally, EKS, GKE,
AKS, DigitalOcean, a bare-metal cluster, ...) — nothing here is cloud-specific.

## 1. ingress-nginx

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace
```

On a local kind/k3d cluster without a cloud load balancer, either use
`--set controller.service.type=NodePort` or a tool like `kind`'s
extraPortMappings / `k3d`'s `--port` flags to reach it from your host.

## 2. cert-manager

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set crds.enabled=true
```

Then apply the ClusterIssuers (edit the `email:` field first):

```bash
kubectl apply -f cluster-issuer.yaml
```

Skip this step entirely for local dev — `values-dev.yaml` sets
`ingress.clusterIssuer: ""`, which serves plain HTTP with no TLS.

## 3. KEDA

Powers `worker-scaledobject.yaml` — scales the `worker` Deployment on
RabbitMQ queue depth (replacing the ECS `queue_depth` autoscaling policy
from the old AWS Terraform).

```bash
helm repo add kedacore https://kedacore.github.io/charts
helm repo update
helm install keda kedacore/keda --namespace keda --create-namespace
```

## 4. External Secrets Operator (GKE only — skip for local dev)

Replaces manually re-typing real API keys into `kubectl create secret`
every time a cluster is recreated (see `../README.md`'s "local dev only"
vs. "GKE" secrets sections). Reads from GCP Secret Manager via Workload
Identity — requires `infra/terraform/` to already be applied (it
provisions the GCP service account this binds to).

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm repo update
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets --create-namespace
```

Edit `external-secrets/service-account.yaml`'s
`iam.gke.io/gcp-service-account` annotation (fill in `<PROJECT_ID>` — or
just paste `terraform output -raw eso_gsa_email` verbatim, it's already in
the right format) and `external-secrets/cluster-secret-store.yaml`'s
`<PROJECT_ID>`/`<ZONE>`/`<CLUSTER_NAME>` placeholders (from `terraform
output`), then:

```bash
kubectl apply -f external-secrets/service-account.yaml
kubectl apply -f external-secrets/cluster-secret-store.yaml
kubectl get clustersecretstore gcp-secret-manager   # should report Ready=True
```

Then populate the real secret values and apply the per-environment
`ExternalSecret`s — see `../external-secrets/README.md`.

## Verify

```bash
kubectl get pods -n ingress-nginx
kubectl get pods -n cert-manager
kubectl get pods -n keda
kubectl get clusterissuer
kubectl get pods -n external-secrets       # GKE only
kubectl get clustersecretstore             # GKE only
```

All should be `Running`/`Ready` before installing the app chart.
