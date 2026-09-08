# Zonal GKE cluster with Workload Identity + GKE Managed Prometheus enabled,
# and a separately-managed, autoscaling node pool (the default node pool
# that comes with google_container_cluster is deliberately removed — a
# custom node pool is the standard way to control machine type/autoscaling
# independently of cluster lifecycle).

resource "google_container_cluster" "vivexy" {
  name     = var.cluster_name
  location = var.zone
  project  = var.project_id

  # Managed separately below — a fixed default pool would fight the
  # autoscaling node pool for node count.
  remove_default_node_pool = true
  initial_node_count       = 1

  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # Free, built into GKE — no separate Prometheus install needed. This is
  # what the observability phase's PodMonitoring/Grafana setup depends on.
  monitoring_config {
    enable_components = ["SYSTEM_COMPONENTS"]
    managed_prometheus {
      enabled = true
    }
  }

  release_channel {
    channel = "REGULAR"
  }

  deletion_protection = false
}

resource "google_container_node_pool" "primary" {
  name     = "${var.cluster_name}-primary"
  cluster  = google_container_cluster.vivexy.name
  location = var.zone
  project  = var.project_id

  initial_node_count = var.node_min_count

  autoscaling {
    min_node_count = var.node_min_count
    max_node_count = var.node_max_count
  }

  node_config {
    machine_type = var.node_machine_type
    oauth_scopes = ["https://www.googleapis.com/auth/cloud-platform"]

    # Required for per-pod Workload Identity (used by External Secrets
    # Operator to reach Secret Manager with no key file on the cluster).
    workload_metadata_config {
      mode = "GKE_METADATA"
    }
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }
}
