variable "aws_region" {
  type        = string
  description = "AWS region to deploy into."
  default     = "us-east-1"
}

variable "project_name" {
  type        = string
  description = "Short slug used for resource naming (lowercase, kebab-case)."
  default     = "portfolio-helper"
}

variable "environment" {
  type        = string
  description = "Environment label (prod, staging, etc)."
}

variable "domain_name" {
  type        = string
  description = "Apex domain (e.g. example.com). Route53 hosted zone must pre-exist."
}

variable "frontend_subdomain" {
  type        = string
  description = "Subdomain for the Next.js frontend (e.g. app)."
  default     = "app"
}

variable "api_subdomain" {
  type        = string
  description = "Subdomain for the Flask agents-service (e.g. api)."
  default     = "api"
}

# ---- Images ----------------------------------------------------------------

variable "ghcr_owner" {
  type        = string
  description = "GitHub org/user that owns the GHCR images."
}

variable "frontend_image_tag" {
  type        = string
  description = "Image tag for the frontend (overridden per-deploy by CI)."
  default     = "latest"
}

variable "agents_image_tag" {
  type        = string
  description = "Image tag for the agents-service (overridden per-deploy by CI)."
  default     = "latest"
}

variable "ghcr_credentials_secret_arn" {
  type        = string
  description = "ARN of a Secrets Manager secret holding {\"username\":\"...\",\"password\":\"...\"} for GHCR pulls."
}

# ---- Database --------------------------------------------------------------

variable "rds_instance_class" {
  type        = string
  default     = "db.t4g.medium"
}

variable "rds_allocated_storage_gb" {
  type        = number
  default     = 50
}

variable "rds_read_replica_count" {
  type        = number
  default     = 0
  description = "Number of RDS read replicas. Bump to 1-5 when read traffic grows."
}

variable "db_name" {
  type    = string
  default = "portfolio_helper"
}

variable "db_master_username" {
  type    = string
  default = "portfoliohelper"
}

# ---- Cache / broker --------------------------------------------------------

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.small"
}

variable "redis_num_shards" {
  type    = number
  default = 1
}

variable "redis_replicas_per_shard" {
  type    = number
  default = 1
}

variable "mq_instance_type" {
  type    = string
  default = "mq.t3.micro"
}

# ---- ECS services ----------------------------------------------------------

variable "frontend_service" {
  type = object({
    cpu            = number
    memory         = number
    desired_count  = number
    min_count      = number
    max_count      = number
  })
  default = {
    cpu           = 512
    memory        = 1024
    desired_count = 2
    min_count     = 2
    max_count     = 10
  }
}

variable "agents_service" {
  type = object({
    cpu            = number
    memory         = number
    desired_count  = number
    min_count      = number
    max_count      = number
  })
  default = {
    cpu           = 1024
    memory        = 2048
    desired_count = 2
    min_count     = 2
    max_count     = 20
  }
}

variable "worker_service" {
  type = object({
    cpu            = number
    memory         = number
    desired_count  = number
    min_count      = number
    max_count      = number
  })
  default = {
    cpu           = 1024
    memory        = 2048
    desired_count = 1
    min_count     = 1
    max_count     = 20
  }
}

# ---- Secrets wiring --------------------------------------------------------
#
# We keep one Secrets Manager secret per concern. Bootstrap these manually
# (see README) then reference their ARNs here so ECS injects them.

variable "app_secrets" {
  type = map(string)
  description = "Map from env var name -> Secrets Manager secret ARN (or ARN:json-key)."
  default     = {}
}
