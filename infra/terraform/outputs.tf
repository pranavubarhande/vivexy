output "cluster_name" {
  value = module.gke_cluster.cluster_name
}

output "zone" {
  value = module.gke_cluster.zone
}

output "project_id" {
  value = var.project_id
}

output "eso_gsa_email" {
  description = "Carry this into infra/k8s/bootstrap/external-secrets/service-account.yaml's iam.gke.io/gcp-service-account annotation."
  value       = module.workload_identity_eso.eso_gsa_email
}

output "get_credentials_command" {
  description = "Run this after `terraform apply` to point kubectl at the new cluster."
  value       = "gcloud container clusters get-credentials ${module.gke_cluster.cluster_name} --zone ${module.gke_cluster.zone} --project ${var.project_id}"
}
