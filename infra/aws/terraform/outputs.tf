output "alb_dns_name" {
  description = "ALB DNS name — point Route53 records here (already done by the route53 module)."
  value       = module.alb.dns_name
}

output "rds_endpoint" {
  value     = module.rds.endpoint
  sensitive = true
}

output "redis_endpoint" {
  value     = module.elasticache.endpoint
  sensitive = true
}

output "mq_console_url" {
  description = "Amazon MQ web console URL (for queue inspection)."
  value       = module.mq.console_url
}

output "s3_bucket_name" {
  value = module.s3.bucket_name
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "ecs_service_names" {
  value = {
    frontend    = module.ecs_frontend.service_name
    agents      = module.ecs_agents.service_name
    chat_worker = module.ecs_worker.service_name
  }
}
