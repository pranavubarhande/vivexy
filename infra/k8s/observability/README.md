# Observability — GKE Managed Prometheus + Grafana

`monitoring_config.managed_prometheus.enabled` is turned on at the cluster
level in `infra/terraform/` — free, built into GKE, no separate Prometheus
install. This directory is the in-cluster half: `PodMonitoring` CRDs telling
GMP's collector what to scrape beyond system components, plus a vendored
copy of Google's query-frontend proxy (GMP's backend isn't directly
PromQL-queryable without it). `../../argocd/apps/grafana.yaml` deploys
Grafana alone — deliberately not `kube-prometheus-stack`, which would run a
second Prometheus and cost meaningfully more on a small autoscaling node
pool that's also running Postgres-HA/RabbitMQ/MinIO/Redis-Stack/the app.

Everything here is synced by ArgoCD (`observability-manifests` +
`grafana` Applications) once `infra/argocd/bootstrap/root-app.yaml` is
applied — nothing to `kubectl apply` by hand.

## `PodMonitoring` selectors — verified, not guessed

`prod/postgres-podmonitoring.yaml` and `prod/rabbitmq-podmonitoring.yaml`'s
label selectors and port names were confirmed by actually rendering the
chart (`helm template ... --set postgresql-ha.metrics.enabled=true --set
rabbitmq.metrics.enabled=true`) and reading the real Pod labels/container
ports, not assumed from the subcharts' documentation. `staging/` mirrors
the same selectors into the `vivexy-staging` namespace.

`postgresql-ha.metrics.enabled` / `rabbitmq.metrics.enabled` default to
`false` in the vendored charts (verified against the tarballs in
`../charts/vivexy/charts/`) — `values-staging.yaml`/`values-prod.yaml` turn
them on. Without that, the exporter sidecars/ports these `PodMonitoring`s
scrape don't exist at all.

## Worth checking after rollout, not pre-emptively fixed here

The chart's `default-deny-ingress` `NetworkPolicy` (`podSelector: {}`, on in
both staging/prod — see `../charts/vivexy/templates/networkpolicy.yaml`)
denies ingress to every pod in the namespace by default. GMP's collector
typically runs as a node-level DaemonSet outside standard `NetworkPolicy`
enforcement paths, so this likely doesn't block scraping — but verify
empirically (`kubectl describe podmonitoring` for scrape errors, or check
GMP's collector logs) rather than assume.

## Viewing Grafana

No public domain yet (consistent with DNS staying out of scope for this
whole setup):

```bash
kubectl -n monitoring get secret grafana -o jsonpath='{.data.admin-password}' | base64 -d
kubectl -n monitoring port-forward svc/grafana 3000:80
# http://localhost:3000, username "admin"
```

The "GKE Managed Prometheus" datasource is pre-wired and set as default —
no manual datasource setup needed.
