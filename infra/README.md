# infra

**New here? Start with [`DEPLOYMENT.md`](DEPLOYMENT.md)** — a from-scratch,
end-to-end walkthrough of standing up `vivexy` on GKE (Terraform → cluster
add-ons → secrets → ArgoCD → CI → verify), plus a troubleshooting section
covering every real problem hit building this.

## Layout

- `terraform/` — the GKE cluster, its autoscaling node pool, and the
  Workload Identity binding External Secrets Operator uses. See
  `terraform/README.md`.
- `k8s/bootstrap/` — one-time cluster add-ons the app chart depends on but
  doesn't install itself (ingress-nginx, cert-manager, KEDA, External
  Secrets Operator). See `k8s/bootstrap/README.md`.
- `k8s/external-secrets/` — declarative `ExternalSecret` manifests; real
  values live in GCP Secret Manager, never in git. See
  `k8s/external-secrets/README.md`.
- `k8s/charts/vivexy/` — the Helm chart itself. Postgres, Redis, RabbitMQ,
  and object storage (MinIO) run **in-cluster** as chart dependencies
  rather than external managed services. See `k8s/README.md` for the
  local-dev (kind/k3d) manual install flow — GKE environments are never
  `helm upgrade`d by hand, see below.
- `argocd/` — GitOps: an "app of apps" that keeps `vivexy-prod` (and
  anything else under `argocd/apps/`) continuously reconciled against
  this repo. See `argocd/README.md`. Nothing in CI ever runs `helm
  upgrade`/`kubectl apply` against a GKE cluster directly.
- `k8s/observability/` — GKE Managed Prometheus `PodMonitoring` CRDs +
  Grafana. See `k8s/observability/README.md`.
- `docker/` — Dockerfiles for the two images (`agents-service`,
  `frontend`) built and pushed by `.github/workflows/build-and-push.yml`.
- `load-tests/` — ad-hoc load-testing scripts, see `load-tests/README.md`.

`*-disabled/` directories (`argocd/apps-disabled/`,
`k8s/observability-disabled/`) hold manifests deliberately kept out of
ArgoCD's auto-synced paths — currently the staging environment, disabled
to conserve a single small GCP project's shared quota. Move a file back
into its non-`-disabled` sibling directory to re-enable it.
