output "eso_gsa_email" {
  description = "Carry this into infra/k8s/bootstrap/external-secrets/service-account.yaml's iam.gke.io/gcp-service-account annotation."
  value       = google_service_account.eso.email
}
