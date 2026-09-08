variable "project_id" {
  description = "GCP project ID (the same project this whole session's manual gcloud commands targeted)."
  type        = string
}

variable "zone" {
  description = "GCP zone for the (zonal, not regional) GKE cluster. A zonal cluster matches the current single-zone cost baseline; a regional cluster would triple the minimum node/control-plane footprint."
  type        = string
  default     = "us-central1-a"
}

variable "cluster_name" {
  description = "GKE cluster name."
  type        = string
  default     = "vivexy"
}

variable "node_machine_type" {
  description = "Machine type for the node pool. Matches the machine type used in every manual gcloud cluster creation this session."
  type        = string
  default     = "e2-standard-2"
}

variable "node_min_count" {
  description = "Node pool autoscaling floor."
  type        = number
  default     = 1
}

variable "node_max_count" {
  description = "Node pool autoscaling ceiling. This is the actual fix for the bottleneck found during load testing: previously the node pool was a fixed 3 nodes with no autoscaling, so HPA/KEDA could ask for more agents/worker pods than the cluster had CPU headroom for, and those pods just sat Pending."
  type        = number
  default     = 6
}
