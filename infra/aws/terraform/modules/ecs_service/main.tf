variable "name_prefix" { type = string }
variable "service_name" { type = string }
variable "cluster_arn" { type = string }
variable "image" { type = string }
variable "command" {
  type    = list(string)
  default = []
}
variable "container_port" { type = number }
variable "cpu" { type = number }
variable "memory" { type = number }
variable "desired_count" { type = number }
variable "min_count" { type = number }
variable "max_count" { type = number }
variable "private_subnet_ids" { type = list(string) }
variable "task_security_group_id" { type = string }

variable "environment" {
  type        = map(string)
  description = "Plaintext env vars."
  default     = {}
}

variable "secrets" {
  type        = map(string)
  description = "Map env var name -> Secrets Manager ARN (or ARN:json-key)."
  default     = {}
}

variable "ghcr_credentials_secret_arn" { type = string }

variable "target_group_arn" {
  type    = string
  default = null
}

variable "aws_region" { type = string }

variable "enable_alb_autoscaling" {
  type    = bool
  default = false
}
variable "alb_arn_suffix" {
  type    = string
  default = ""
}
variable "alb_target_group_arn_suffix" {
  type    = string
  default = ""
}

variable "enable_queue_autoscaling" {
  type    = bool
  default = false
}
variable "mq_broker_id" {
  type    = string
  default = ""
}
variable "queue_name" {
  type    = string
  default = ""
}

locals {
  family   = "${var.name_prefix}-${var.service_name}"
  log_group = "/ecs/${local.family}"
}

resource "aws_cloudwatch_log_group" "this" {
  name              = local.log_group
  retention_in_days = 30
}

data "aws_iam_policy_document" "task_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${local.family}-execution"
  assume_role_policy = data.aws_iam_policy_document.task_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execution_secrets" {
  statement {
    actions = [
      "secretsmanager:GetSecretValue",
      "kms:Decrypt",
    ]
    # Always allow exact ARNs as supplied. If a caller passes the
    # ARN:JSON-KEY:: form, also allow the prefix wildcard so IAM matches it.
    resources = distinct(concat(
      [var.ghcr_credentials_secret_arn],
      values(var.secrets),
      [for arn in values(var.secrets) : "${join(":", slice(split(":", arn), 0, 7))}*"]
    ))
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

resource "aws_iam_role" "task" {
  name               = "${local.family}-task"
  assume_role_policy = data.aws_iam_policy_document.task_assume.json
}

# Allow tasks to read/write the uploads bucket. We scope by name convention
# rather than passing the bucket ARN in to keep the module API slim; a tighter
# variant would inject the bucket ARN per-service.
data "aws_iam_policy_document" "task_s3" {
  statement {
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
      "s3:ListBucket",
    ]
    resources = [
      "arn:aws:s3:::${var.name_prefix}-uploads-*",
      "arn:aws:s3:::${var.name_prefix}-uploads-*/*",
    ]
  }
}

resource "aws_iam_role_policy" "task_s3" {
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_s3.json
}

locals {
  env_list = [for k, v in var.environment : {
    name  = k
    value = v
  }]
  secrets_list = [for k, v in var.secrets : {
    name      = k
    valueFrom = v
  }]

  port_mappings = var.container_port > 0 ? [
    { containerPort = var.container_port, hostPort = var.container_port, protocol = "tcp" }
  ] : []

  container_def = [{
    name         = var.service_name
    image        = var.image
    command      = length(var.command) > 0 ? var.command : null
    essential    = true
    portMappings = local.port_mappings
    environment  = local.env_list
    secrets      = local.secrets_list
    repositoryCredentials = {
      credentialsParameter = var.ghcr_credentials_secret_arn
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = local.log_group
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = var.service_name
      }
    }
  }]
}

resource "aws_ecs_task_definition" "this" {
  family                   = local.family
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.cpu)
  memory                   = tostring(var.memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions    = jsonencode(local.container_def)
}

resource "aws_ecs_service" "this" {
  name            = var.service_name
  cluster         = var.cluster_arn
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.task_security_group_id]
    assign_public_ip = false
  }

  dynamic "load_balancer" {
    for_each = var.target_group_arn == null ? [] : [1]
    content {
      target_group_arn = var.target_group_arn
      container_name   = var.service_name
      container_port   = var.container_port
    }
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  # Let CI update the task definition without Terraform drifting it back.
  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}

# ---- Autoscaling ---------------------------------------------------------

resource "aws_appautoscaling_target" "this" {
  max_capacity       = var.max_count
  min_capacity       = var.min_count
  resource_id        = "service/${element(split("/", var.cluster_arn), 1)}/${aws_ecs_service.this.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${local.family}-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.this.resource_id
  scalable_dimension = aws_appautoscaling_target.this.scalable_dimension
  service_namespace  = aws_appautoscaling_target.this.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_policy" "alb_requests" {
  count = var.enable_alb_autoscaling ? 1 : 0

  name               = "${local.family}-alb-requests"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.this.resource_id
  scalable_dimension = aws_appautoscaling_target.this.scalable_dimension
  service_namespace  = aws_appautoscaling_target.this.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value = 400
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${var.alb_arn_suffix}/${var.alb_target_group_arn_suffix}"
    }
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_policy" "queue_depth" {
  count = var.enable_queue_autoscaling ? 1 : 0

  name               = "${local.family}-queue-depth"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.this.resource_id
  scalable_dimension = aws_appautoscaling_target.this.scalable_dimension
  service_namespace  = aws_appautoscaling_target.this.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value = 25 # target avg messages per worker

    customized_metric_specification {
      metric_name = "MessageCount"
      namespace   = "AWS/AmazonMQ"
      statistic   = "Average"
      dimensions {
        name  = "Broker"
        value = var.mq_broker_id
      }
      dimensions {
        name  = "Queue"
        value = var.queue_name
      }
    }
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

output "service_name" { value = aws_ecs_service.this.name }
output "task_definition_family" { value = aws_ecs_task_definition.this.family }
output "task_role_arn" { value = aws_iam_role.task.arn }
output "execution_role_arn" { value = aws_iam_role.execution.arn }
output "log_group" { value = aws_cloudwatch_log_group.this.name }
