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
