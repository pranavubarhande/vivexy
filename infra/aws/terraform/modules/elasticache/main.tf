variable "name_prefix" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "allowed_cidr_blocks" { type = list(string) }
variable "node_type" { type = string }
variable "num_shards" { type = number }
variable "replicas_per_shard" { type = number }

resource "random_password" "auth_token" {
  length           = 40
  special          = false # Redis AUTH token only allows a subset
}

resource "aws_secretsmanager_secret" "auth_token" {
  name = "${var.name_prefix}/redis/auth-token"
}
resource "aws_secretsmanager_secret_version" "auth_token" {
  secret_id     = aws_secretsmanager_secret.auth_token.id
  secret_string = random_password.auth_token.result
}

resource "aws_elasticache_subnet_group" "this" {
  name       = "${var.name_prefix}-redis"
  subnet_ids = var.private_subnet_ids
}

resource "aws_security_group" "redis" {
  name   = "${var.name_prefix}-redis"
  vpc_id = var.vpc_id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id       = "${var.name_prefix}-redis"
  description                = "Portfolio Helper Redis"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.node_type
  num_node_groups            = var.num_shards
  replicas_per_node_group    = var.replicas_per_shard
  automatic_failover_enabled = true
  multi_az_enabled           = true
  parameter_group_name       = "default.redis7.cluster.on"
  subnet_group_name          = aws_elasticache_subnet_group.this.name
  security_group_ids         = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.auth_token.result
  apply_immediately          = false
}

output "endpoint" { value = aws_elasticache_replication_group.this.configuration_endpoint_address }
output "connection_url" {
  value     = "rediss://:${random_password.auth_token.result}@${aws_elasticache_replication_group.this.configuration_endpoint_address}:6379"
  sensitive = true
}
