# infra

- `docker/` — Dockerfiles for the two images (`agents-service`, `frontend`)
  pushed to GHCR by `.github/workflows/build-and-push.yml`. Unchanged by the
  k8s migration — k8s pulls the same images.
- `k8s/` — the deployment target. See `k8s/README.md` to install/upgrade,
  and `k8s/bootstrap/README.md` for one-time cluster add-ons
  (ingress-nginx, cert-manager, KEDA).

The previous AWS Terraform (ECS/RDS/ElastiCache/Amazon MQ), Coolify
docker-compose, and Koyeb deployment paths have been retired in favor of the
Kubernetes chart in `k8s/` — Postgres, Redis, RabbitMQ, and object storage
now run in-cluster (via `k8s/charts/portfolio-helper`'s Helm dependencies)
rather than as external managed cloud services.
