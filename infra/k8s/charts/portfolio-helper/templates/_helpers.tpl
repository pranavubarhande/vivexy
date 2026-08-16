{{/*
Chart name and version label.
*/}}
{{- define "portfolio-helper.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels applied to every resource this chart owns.
*/}}
{{- define "portfolio-helper.labels" -}}
helm.sh/chart: {{ include "portfolio-helper.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: portfolio-helper
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Selector labels for a given component (frontend/agents/worker/scheduler).
Usage: {{ include "portfolio-helper.selectorLabels" (dict "component" "agents" "root" $) }}
*/}}
{{- define "portfolio-helper.selectorLabels" -}}
app.kubernetes.io/name: portfolio-helper-{{ .component }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
{{- end -}}

{{/*
Full agents-service image reference.
*/}}
{{- define "portfolio-helper.agentsImage" -}}
{{ .Values.image.registry }}/{{ .Values.image.owner }}/{{ .Values.image.agentsRepository }}:{{ .Values.image.tag }}
{{- end -}}

{{/*
Full frontend image reference.
*/}}
{{- define "portfolio-helper.frontendImage" -}}
{{ .Values.image.registry }}/{{ .Values.image.owner }}/{{ .Values.image.frontendRepository }}:{{ .Values.image.tag }}
{{- end -}}

{{/*
Postgres host:port — the pgpool Service front-ends primary+replicas with
transparent read/write splitting (see values.yaml comment on postgresql-ha).
*/}}
{{- define "portfolio-helper.postgresHost" -}}
{{ .Release.Name }}-postgresql-ha-pgpool
{{- end -}}

{{/*
Redis host:port — points at the replication master service.
*/}}
{{- define "portfolio-helper.redisHost" -}}
{{ .Release.Name }}-redis-master
{{- end -}}

{{/*
RabbitMQ host:port.
*/}}
{{- define "portfolio-helper.rabbitmqHost" -}}
{{ .Release.Name }}-rabbitmq
{{- end -}}

{{/*
MinIO (S3-compatible) endpoint.
*/}}
{{- define "portfolio-helper.minioEndpoint" -}}
http://{{ .Release.Name }}-minio:9000
{{- end -}}

{{/*
Shell snippet exported at container start to compose DATABASE_URL /
REDIS_URL / RABBITMQ_URL from ConfigMap-known hosts + the shared
data-credentials Secret (mounted as env vars by the pod spec: PG_PASSWORD,
REDIS_PASSWORD, RABBITMQ_PASSWORD). Keeps subchart-generated secret naming
out of the app image entirely — see values.yaml's postgresql-ha/redis/
rabbitmq `existingSecret` wiring for the other end of this.
*/}}
{{- define "portfolio-helper.composeConnectionUrls" -}}
{{- $pg := index .Values "postgresql-ha" -}}
export DATABASE_URL="postgresql://{{ $pg.postgresql.username }}:${PG_PASSWORD}@{{ include "portfolio-helper.postgresHost" . }}:5432/{{ $pg.postgresql.database }}";
export REDIS_URL="redis://:${REDIS_PASSWORD}@{{ include "portfolio-helper.redisHost" . }}:6379";
export RABBITMQ_URL="amqp://{{ .Values.rabbitmq.auth.username }}:${RABBITMQ_PASSWORD}@{{ include "portfolio-helper.rabbitmqHost" . }}:5672";
{{- end -}}
