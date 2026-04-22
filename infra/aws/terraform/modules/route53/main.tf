variable "domain_name" { type = string }

variable "records" {
  type = map(object({
    target  = string
    zone_id = string
  }))
  description = "Map FQDN -> { target, zone_id } used for A/AAAA alias records."
}

data "aws_route53_zone" "this" {
  name         = var.domain_name
  private_zone = false
}

resource "aws_route53_record" "a" {
  for_each = var.records

  zone_id = data.aws_route53_zone.this.zone_id
  name    = each.key
  type    = "A"

  alias {
    name                   = each.value.target
    zone_id                = each.value.zone_id
    evaluate_target_health = true
  }
}

output "zone_id" { value = data.aws_route53_zone.this.zone_id }
