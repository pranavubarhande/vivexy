variable "name_prefix" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "allowed_cidr_blocks" { type = list(string) }
variable "instance_type" { type = string }

resource "random_password" "admin" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "admin" {
  name = "${var.name_prefix}/mq/admin-password"
}
resource "aws_secretsmanager_secret_version" "admin" {
  secret_id     = aws_secretsmanager_secret.admin.id
  secret_string = random_password.admin.result
}

resource "aws_security_group" "mq" {
  name   = "${var.name_prefix}-mq"
  vpc_id = var.vpc_id

  ingress {
    from_port   = 5671
    to_port     = 5671
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
    description = "AMQPS"
  }
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
    description = "RabbitMQ management console"
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_mq_broker" "this" {
  broker_name        = "${var.name_prefix}-mq"
  engine_type        = "RabbitMQ"
  engine_version     = "3.13"
  host_instance_type = var.instance_type
  deployment_mode    = length(var.private_subnet_ids) >= 2 ? "CLUSTER_MULTI_AZ" : "SINGLE_INSTANCE"
  publicly_accessible = false
  subnet_ids         = var.private_subnet_ids
  security_groups    = [aws_security_group.mq.id]
  auto_minor_version_upgrade = true

  user {
    username = "admin"
    password = random_password.admin.result
  }
}

locals {
  amqps_host = replace(aws_mq_broker.this.instances[0].endpoints[0], "amqps://", "")
}

output "broker_id" { value = aws_mq_broker.this.id }
output "connection_url" {
  value     = "amqps://admin:${random_password.admin.result}@${local.amqps_host}"
  sensitive = true
}
output "console_url" {
  value = aws_mq_broker.this.instances[0].console_url
}
