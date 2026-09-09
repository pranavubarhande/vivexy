variable "project_id" {
  type = string
}

variable "eso_ksa_namespace" {
  description = "Namespace of the Kubernetes ServiceAccount ESO runs as."
  type        = string
  default     = "external-secrets"
}

variable "eso_ksa_name" {
  description = "Name of the Kubernetes ServiceAccount ESO runs as."
  type        = string
  default     = "eso-secret-manager"
}
