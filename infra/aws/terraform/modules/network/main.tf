variable "name_prefix" { type = string }
variable "aws_region" { type = string }
variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags = { Name = "${var.name_prefix}-vpc" }
}

resource "aws_subnet" "public" {
  for_each                = toset(local.azs)
  vpc_id                  = aws_vpc.this.id
  availability_zone       = each.key
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, index(local.azs, each.key))
  map_public_ip_on_launch = true
  tags = { Name = "${var.name_prefix}-public-${each.key}" }
}

resource "aws_subnet" "private" {
  for_each          = toset(local.azs)
  vpc_id            = aws_vpc.this.id
  availability_zone = each.key
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, index(local.azs, each.key) + 10)
  tags = { Name = "${var.name_prefix}-private-${each.key}" }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.name_prefix}-igw" }
}

resource "aws_eip" "nat" {
  for_each = toset(local.azs)
  domain   = "vpc"
  tags     = { Name = "${var.name_prefix}-nat-${each.key}" }
}

resource "aws_nat_gateway" "this" {
  for_each      = toset(local.azs)
  allocation_id = aws_eip.nat[each.key].id
  subnet_id     = aws_subnet.public[each.key].id
  tags          = { Name = "${var.name_prefix}-nat-${each.key}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = { Name = "${var.name_prefix}-public" }
}

resource "aws_route_table_association" "public" {
  for_each       = aws_subnet.public
  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  for_each = aws_subnet.private
  vpc_id   = aws_vpc.this.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this[each.key].id
  }
  tags = { Name = "${var.name_prefix}-private-${each.key}" }
}

resource "aws_route_table_association" "private" {
  for_each       = aws_subnet.private
  subnet_id      = each.value.id
  route_table_id = aws_route_table.private[each.key].id
}

# Shared security group for ECS tasks. ALB SG is defined in the alb module.
resource "aws_security_group" "ecs_tasks" {
  name        = "${var.name_prefix}-ecs-tasks"
  description = "Portfolio Helper ECS task SG"
  vpc_id      = aws_vpc.this.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

output "vpc_id"                      { value = aws_vpc.this.id }
output "vpc_cidr"                    { value = aws_vpc.this.cidr_block }
output "public_subnet_ids"           { value = [for s in aws_subnet.public : s.id] }
output "private_subnet_ids"          { value = [for s in aws_subnet.private : s.id] }
output "ecs_tasks_security_group_id" { value = aws_security_group.ecs_tasks.id }
