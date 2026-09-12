variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "zone" {
  description = "GCP zone for the GKE cluster."
  type        = string
  default     = "us-central1-a"
}

variable "cluster_name" {
  description = "GKE cluster name."
  type        = string
  default     = "vivexy"
}

variable "node_machine_type" {
  description = "Machine type for the node pool."
  type        = string
  default     = "e2-standard-2"
}

variable "node_min_count" {
  description = "Node pool autoscaling floor."
  type        = number
  default     = 1
}

variable "node_max_count" {
  description = "Node pool autoscaling ceiling."
  type        = number
  default     = 6
}

variable "node_disk_size_gb" {
  description = "Boot disk size per node. Kept small since node boot disks count against the project's regional SSD_TOTAL_GB quota alongside app PVCs, but not so small that kubelet's disk-pressure eviction threshold triggers once several service images are pulled onto a node (30GB was too tight in practice)."
  type        = number
  default     = 50
}
