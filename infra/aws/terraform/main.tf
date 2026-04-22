locals {
  name_prefix = "${var.project_name}-${var.environment}"

  frontend_image = "ghcr.io/${var.ghcr_owner}/portfolio-helper-frontend:${var.frontend_image_tag}"
  agents_image   = "ghcr.io/${var.ghcr_owner}/portfolio-helper-agents:${var.agents_image_tag}"

  frontend_fqdn = "${var.frontend_subdomain}.${var.domain_name}"
  api_fqdn      = "${var.api_subdomain}.${var.domain_name}"

  # Plaintext env vars shared by web + worker. Secrets go through
  # var.app_secrets and are injected via the task definition's `secrets`.
  common_env = {
    AWS_REGION = var.aws_region
  }

  agents_env = merge(local.common_env, {
    FLASK_ENV          = "production"
    PORT               = "5000"
    USE_RABBITMQ       = "true"
    USE_REDIS_STREAM   = "true"
    SANDBOX_ENABLED    = "true"
    CORS_ORIGINS       = "https://${local.frontend_fqdn}"
    AWS_S3_REGION      = var.aws_region
    AWS_S3_BUCKET_NAME = module.s3.bucket_name
  })

  frontend_env = merge(local.common_env, {
    NODE_ENV              = "production"
    NEXT_PUBLIC_APP_URL   = "https://${local.frontend_fqdn}"
    NEXT_PUBLIC_API_URL   = "https://${local.api_fqdn}"
    NEXTAUTH_URL          = "https://${local.frontend_fqdn}"
    NEXT_PUBLIC_AUTH_ENABLED = "true"
  })
}

module "network" {
  source      = "./modules/network"
  name_prefix = local.name_prefix
  aws_region  = var.aws_region
}

module "s3" {
  source       = "./modules/s3"
  name_prefix  = local.name_prefix
  cors_origins = ["https://${local.frontend_fqdn}"]
}

module "rds" {
  source              = "./modules/rds"
  name_prefix         = local.name_prefix
  vpc_id              = module.network.vpc_id
  private_subnet_ids  = module.network.private_subnet_ids
  allowed_cidr_blocks = [module.network.vpc_cidr]
  instance_class      = var.rds_instance_class
  allocated_storage   = var.rds_allocated_storage_gb
  db_name             = var.db_name
  master_username     = var.db_master_username
  read_replica_count  = var.rds_read_replica_count
}

module "elasticache" {
  source              = "./modules/elasticache"
  name_prefix         = local.name_prefix
  vpc_id              = module.network.vpc_id
  private_subnet_ids  = module.network.private_subnet_ids
  allowed_cidr_blocks = [module.network.vpc_cidr]
  node_type           = var.redis_node_type
  num_shards          = var.redis_num_shards
  replicas_per_shard  = var.redis_replicas_per_shard
}

module "mq" {
  source              = "./modules/mq"
  name_prefix         = local.name_prefix
  vpc_id              = module.network.vpc_id
  private_subnet_ids  = module.network.private_subnet_ids
  allowed_cidr_blocks = [module.network.vpc_cidr]
  instance_type       = var.mq_instance_type
}

module "alb" {
  source             = "./modules/alb"
  name_prefix        = local.name_prefix
  vpc_id             = module.network.vpc_id
  public_subnet_ids  = module.network.public_subnet_ids
  frontend_fqdn      = local.frontend_fqdn
  api_fqdn           = local.api_fqdn
  domain_name        = var.domain_name
}

module "route53" {
  source        = "./modules/route53"
  domain_name   = var.domain_name
  records = {
    (local.frontend_fqdn) = { target = module.alb.dns_name, zone_id = module.alb.zone_id }
    (local.api_fqdn)      = { target = module.alb.dns_name, zone_id = module.alb.zone_id }
  }
}

# ---- Connection-string secrets auto-created from RDS / ElastiCache / MQ ----
# Stored in Secrets Manager so task definitions can reference them by ARN.
resource "aws_secretsmanager_secret" "database_url" {
  name = "${local.name_prefix}/database-url"
}
resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = module.rds.connection_url
}

resource "aws_secretsmanager_secret" "redis_url" {
  name = "${local.name_prefix}/redis-url"
}
resource "aws_secretsmanager_secret_version" "redis_url" {
  secret_id     = aws_secretsmanager_secret.redis_url.id
  secret_string = module.elasticache.connection_url
}

resource "aws_secretsmanager_secret" "rabbitmq_url" {
  name = "${local.name_prefix}/rabbitmq-url"
}
resource "aws_secretsmanager_secret_version" "rabbitmq_url" {
  secret_id     = aws_secretsmanager_secret.rabbitmq_url.id
  secret_string = module.mq.connection_url
}

locals {
  # Secrets that ECS will inject as env vars. Key = env var name, value = ARN.
  # We always inject the Terraform-managed connection strings, plus whatever
  # the caller added to var.app_secrets (API keys, JWT, Stripe, etc).
  ecs_secrets = merge(
    {
      DATABASE_URL = aws_secretsmanager_secret.database_url.arn
      REDIS_URL    = aws_secretsmanager_secret.redis_url.arn
      RABBITMQ_URL = aws_secretsmanager_secret.rabbitmq_url.arn
    },
    var.app_secrets
  )
}

# ---- ECS cluster + services ------------------------------------------------

resource "aws_ecs_cluster" "this" {
  name = local.name_prefix
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

module "ecs_frontend" {
  source            = "./modules/ecs_service"
  name_prefix       = local.name_prefix
  service_name      = "frontend"
  cluster_arn       = aws_ecs_cluster.this.arn
  image             = local.frontend_image
  container_port    = 3000
  cpu               = var.frontend_service.cpu
  memory            = var.frontend_service.memory
  desired_count     = var.frontend_service.desired_count
  min_count         = var.frontend_service.min_count
  max_count         = var.frontend_service.max_count
  private_subnet_ids = module.network.private_subnet_ids
  task_security_group_id = module.network.ecs_tasks_security_group_id
  environment       = local.frontend_env
  secrets           = local.ecs_secrets
  ghcr_credentials_secret_arn = var.ghcr_credentials_secret_arn
  target_group_arn  = module.alb.frontend_target_group_arn
  aws_region        = var.aws_region
  enable_alb_autoscaling = true
  alb_arn_suffix    = module.alb.arn_suffix
  alb_target_group_arn_suffix = module.alb.frontend_target_group_arn_suffix
}

module "ecs_agents" {
  source            = "./modules/ecs_service"
  name_prefix       = local.name_prefix
  service_name      = "agents"
  cluster_arn       = aws_ecs_cluster.this.arn
  image             = local.agents_image
  container_port    = 5000
  cpu               = var.agents_service.cpu
  memory            = var.agents_service.memory
  desired_count     = var.agents_service.desired_count
  min_count         = var.agents_service.min_count
  max_count         = var.agents_service.max_count
  private_subnet_ids = module.network.private_subnet_ids
  task_security_group_id = module.network.ecs_tasks_security_group_id
  environment       = local.agents_env
  secrets           = local.ecs_secrets
  ghcr_credentials_secret_arn = var.ghcr_credentials_secret_arn
  target_group_arn  = module.alb.api_target_group_arn
  aws_region        = var.aws_region
  enable_alb_autoscaling = true
  alb_arn_suffix    = module.alb.arn_suffix
  alb_target_group_arn_suffix = module.alb.api_target_group_arn_suffix
}

module "ecs_worker" {
  source            = "./modules/ecs_service"
  name_prefix       = local.name_prefix
  service_name      = "chat-worker"
  cluster_arn       = aws_ecs_cluster.this.arn
  image             = local.agents_image
  command           = ["python", "-m", "worker.consumer"]
  container_port    = 0
  cpu               = var.worker_service.cpu
  memory            = var.worker_service.memory
  desired_count     = var.worker_service.desired_count
  min_count         = var.worker_service.min_count
  max_count         = var.worker_service.max_count
  private_subnet_ids = module.network.private_subnet_ids
  task_security_group_id = module.network.ecs_tasks_security_group_id
  environment       = local.agents_env
  secrets           = local.ecs_secrets
  ghcr_credentials_secret_arn = var.ghcr_credentials_secret_arn
  target_group_arn  = null
  aws_region        = var.aws_region
  enable_queue_autoscaling = true
  mq_broker_id      = module.mq.broker_id
  queue_name        = "chat_jobs"
}
