# ArgoCD — GitOps deployment

Replaces `.github/workflows/deploy-k8s.yml`'s imperative `helm upgrade
--install` (deleted — see the note below on why this is a full replacement,
not a coexistence). From here, `staging`/`prod` deploys happen by ArgoCD
continuously reconciling this repo against the cluster — nothing in CI ever
runs `helm upgrade` or touches the cluster directly again.

Requires a cluster already provisioned via `infra/terraform/`, with
`infra/k8s/bootstrap/` (ingress-nginx, cert-manager, KEDA, External Secrets
Operator) already applied.

## Install ArgoCD itself

ArgoCD can't deploy itself, so this one step stays a manual Helm install:

```bash
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update
helm install argocd argo/argo-cd --namespace argocd --create-namespace
```

Retrieve the generated admin password (once):

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d
```

View the UI (no public domain yet, consistent with DNS staying out of scope
for this whole setup):

```bash
kubectl -n argocd port-forward svc/argocd-server 8080:443
# https://localhost:8080, username "admin"
```

## Bootstrap everything else

One command, once per cluster lifetime:

```bash
kubectl apply -f bootstrap/root-app.yaml
```

`vivexy-root` (the "app of apps") then creates every `Application` under
`apps/` — `vivexy-prod`, `vivexy-staging`, `external-secrets-prod`,
`external-secrets-staging` (and, once added, `grafana`,
`observability-manifests`) — and keeps them in sync with this directory
going forward. Adding or removing a file under `apps/` and pushing to `main`
is the only action needed to add/remove anything ArgoCD-manages from then
on; no more manual `kubectl apply`/`helm install` for the app layer.

```bash
kubectl get application -n argocd
# vivexy-root, vivexy-prod, vivexy-staging, external-secrets-prod,
# external-secrets-staging should all report Synced/Healthy
```

## Why `deploy-k8s.yml` was deleted, not kept alongside this

Once `vivexy-prod`/`vivexy-staging`'s `syncPolicy.automated` is watching
this chart, a concurrent imperative `helm upgrade` from CI would fight
ArgoCD's reconciliation loop — either ArgoCD immediately reverts CI's change
as drift, or the two race. The `KUBECONFIG` GitHub secret that workflow
needed was never actually created this session (confirmed via `gh secret
list` — empty), so nothing is lost by removing it: GitHub Actions never
touched the cluster directly in practice, and after this change it never
will. See `.github/workflows/update-image-tag.yml` for what replaced it.

Local dev (kind/k3d) is unaffected — it never went through `deploy-k8s.yml`
or ArgoCD, and keeps using the imperative `helm upgrade --install` commands
in `../k8s/README.md`.
