# The GCP service account External Secrets Operator impersonates via
# Workload Identity to read secrets from Secret Manager. No key file is ever
# generated or stored anywhere — the binding below is what lets the
# Kubernetes ServiceAccount (created by hand as part of the ESO bootstrap
# manifests, see infra/k8s/bootstrap/external-secrets/service-account.yaml)
# act as this GSA purely via its Workload Identity annotation.

resource "google_service_account" "eso" {
  project      = var.project_id
  account_id   = "eso-secret-manager"
  display_name = "External Secrets Operator - Secret Manager reader"
}

resource "google_project_iam_member" "eso_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.eso.email}"
}

resource "google_service_account_iam_member" "eso_workload_identity_binding" {
  service_account_id = google_service_account.eso.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[${var.eso_ksa_namespace}/${var.eso_ksa_name}]"
}
