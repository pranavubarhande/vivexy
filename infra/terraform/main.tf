provider "google" {
  project = var.project_id
}

module "gke_cluster" {
  source = "./modules/gke-cluster"

  project_id        = var.project_id
  zone              = var.zone
  cluster_name      = var.cluster_name
  node_machine_type = var.node_machine_type
  node_min_count    = var.node_min_count
  node_max_count    = var.node_max_count
}

module "workload_identity_eso" {
  source = "./modules/workload-identity-eso"

  project_id = var.project_id
}
