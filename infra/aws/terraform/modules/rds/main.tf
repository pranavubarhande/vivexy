variable "name_prefix" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "allowed_cidr_blocks" { type = list(string) }
variable "instance_class" { type = string }
variable "allocated_storage" { type = number }
variable "db_name" { type = string }
variable "master_username" { type = string }
variable "read_replica_count" { type = number }

resource "random_password" "master" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_secretsmanager_secret" "master_password" {
  name = "${var.name_prefix}/rds/master-password"
}

resource "aws_secretsmanager_secret_version" "master_password" {
  secret_id     = aws_secretsmanager_secret.master_password.id
  secret_string = random_password.master.result
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name_prefix}-rds"
  subnet_ids = var.private_subnet_ids
}

resource "aws_security_group" "rds" {
  name   = "${var.name_prefix}-rds"
  vpc_id = var.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
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

resource "aws_db_instance" "primary" {
  identifier                 = "${var.name_prefix}-primary"
  engine                     = "postgres"
  engine_version             = "15"
  instance_class             = var.instance_class
  allocated_storage          = var.allocated_storage
  storage_type               = "gp3"
  storage_encrypted          = true
  db_name                    = var.db_name
  username                   = var.master_username
  password                   = random_password.master.result
  db_subnet_group_name       = aws_db_subnet_group.this.name
  vpc_security_group_ids     = [aws_security_group.rds.id]
  multi_az                   = true
  backup_retention_period    = 7
  auto_minor_version_upgrade = true
  deletion_protection        = true
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${var.name_prefix}-final-${formatdate("YYYYMMDDhhmmss", timestamp())}"
  apply_immediately          = false
  performance_insights_enabled = true

  lifecycle {
    ignore_changes = [final_snapshot_identifier, password]
  }
}

resource "aws_db_instance" "replica" {
  count = var.read_replica_count

  identifier             = "${var.name_prefix}-replica-${count.index + 1}"
  replicate_source_db    = aws_db_instance.primary.identifier
  instance_class         = var.instance_class
  vpc_security_group_ids = [aws_security_group.rds.id]
  skip_final_snapshot    = true
  apply_immediately      = false
  auto_minor_version_upgrade = true
}

output "endpoint" { value = aws_db_instance.primary.endpoint }
output "connection_url" {
  value     = "postgresql://${var.master_username}:${random_password.master.result}@${aws_db_instance.primary.endpoint}/${var.db_name}"
  sensitive = true
}
output "read_endpoints" {
  value = [for r in aws_db_instance.replica : r.endpoint]
}
