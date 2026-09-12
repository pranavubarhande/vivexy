# Disabled staging observability manifests

Kept out of `../../observability/` (which `observability-manifests`
recurses into) for the same reason `../../../argocd/apps-disabled/` exists:
staging is disabled to conserve this project's shared GCP quota, so these
`PodMonitoring`s targeting the (currently nonexistent) `vivexy-staging`
namespace were left permanently `OutOfSync`.

To re-enable, move these files back into `../../observability/staging/`
(re-enable staging itself first via `../../../argocd/apps-disabled/`).
