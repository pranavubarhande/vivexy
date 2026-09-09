output "cluster_name" {
  value = google_container_cluster.vivexy.name
}

output "zone" {
  value = google_container_cluster.vivexy.location
}

output "endpoint" {
  value     = google_container_cluster.vivexy.endpoint
  sensitive = true
}
