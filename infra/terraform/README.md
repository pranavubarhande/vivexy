# Terraform — GKE cluster + autoscaling node pool + Workload Identity

Replaces the ad-hoc `gcloud container clusters create ...` command used to
stand up the cluster by hand every session — this is the deterministic
version, and `terraform destroy` is the deterministic version of the manual
`gcloud container clusters delete` teardown.

Scope is deliberately narrow: the GKE cluster, its autoscaling node pool, and
the GCP service account + Workload Identity binding that External Secrets
Operator uses (see `infra/k8s/bootstrap/external-secrets/`). No DNS/domain
provisioning — no real domain is owned yet, so ingress hostnames stay a
manual `sslip.io` workaround (see `infra/k8s/README.md`) until that changes.

## One-time setup (per GCP project, not per cluster recreation)

```bash
gcloud config set project <PROJECT_ID>

gcloud services enable \
  container.googleapis.com \
  iam.googleapis.com \
  secretmanager.googleapis.com \
  monitoring.googleapis.com

# Remote state bucket — created once, persists across every future
# terraform destroy/apply cycle.
gcloud storage buckets create gs://<PROJECT_ID>-tfstate --location=<region>

cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars: fill in project_id, zone, and anything else you
# want different from the defaults (which match this session's manual
# gcloud cluster creations: e2-standard-2, zonal, us-central1-a).
```

## Every time you want a cluster

```bash
terraform init -backend-config="bucket=<PROJECT_ID>-tfstate"
terraform plan
terraform apply

terraform output -raw get_credentials_command | bash   # points kubectl at the new cluster
terraform output -raw eso_gsa_email                     # carry this into
                                                          # infra/k8s/bootstrap/external-secrets/service-account.yaml's
                                                          # iam.gke.io/gcp-service-account annotation
```

From here, continue with `infra/k8s/bootstrap/README.md` (ingress-nginx,
cert-manager, KEDA, External Secrets Operator) and then
`infra/argocd/README.md`.

## Teardown

```bash
terraform destroy
```

Deterministic — no more hand-typed-flag drift between sessions. This does
**not** delete the GCS state bucket or the GCP project itself, matching the
"keep the project, tear down the cluster" pattern used throughout this
project's sessions.

## What this does NOT manage

- Secret Manager secret *values* — those are created directly with `gcloud
  secrets` (see `infra/k8s/external-secrets/README.md`), not via Terraform,
  so real API keys never pass through Terraform state or a `plan` diff.
- ArgoCD, ingress-nginx, cert-manager, KEDA, External Secrets Operator
  itself — all bootstrapped via Helm/kubectl after the cluster exists (see
  `infra/k8s/bootstrap/README.md`), not by Terraform. Keeping cluster-level
  infra (this) separate from in-cluster add-ons (bootstrap) means an
  add-on version bump never requires a `terraform apply`.
- DNS / a real domain — out of scope until one is actually owned.
