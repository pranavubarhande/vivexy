{{/*
Chart name and version label.
*/}}
{{- define "vivexy.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels applied to every resource this chart owns.
*/}}
{{- define "vivexy.labels" -}}
helm.sh/chart: {{ include "vivexy.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: vivexy
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Selector labels for a given component (frontend/agents/worker/scheduler).
Usage: {{ include "vivexy.selectorLabels" (dict "component" "agents" "root" $) }}
*/}}
{{- define "vivexy.selectorLabels" -}}
app.kubernetes.io/name: vivexy-{{ .component }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
{{- end -}}

{{/*
Full agents-service image reference.
*/}}
{{- define "vivexy.agentsImage" -}}
{{ .Values.image.registry }}/{{ .Values.image.owner }}/{{ .Values.image.agentsRepository }}:{{ .Values.image.tag }}
{{- end -}}

{{/*
Full frontend image reference.
*/}}
{{- define "vivexy.frontendImage" -}}
{{ .Values.image.registry }}/{{ .Values.image.owner }}/{{ .Values.image.frontendRepository }}:{{ .Values.image.tag }}
{{- end -}}

{{/*
Postgres host:port — the pgpool Service front-ends primary+replicas with
transparent read/write splitting (see values.yaml comment on postgresql-ha).
*/}}
{{- define "vivexy.postgresHost" -}}
{{ .Release.Name }}-postgresql-ha-pgpool
{{- end -}}

{{/*
Redis host:port — points at the replication master service.
*/}}
{{- define "vivexy.redisHost" -}}
{{ .Release.Name }}-redis-master
{{- end -}}

{{/*
RabbitMQ host:port.
*/}}
{{- define "vivexy.rabbitmqHost" -}}
{{ .Release.Name }}-rabbitmq
{{- end -}}

{{/*
MinIO (S3-compatible) endpoint.
*/}}
{{- define "vivexy.minioEndpoint" -}}
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
{{- define "vivexy.composeConnectionUrls" -}}
{{- $pg := index .Values "postgresql-ha" -}}
export DATABASE_URL="postgresql://{{ $pg.postgresql.username }}:${PG_PASSWORD}@{{ include "vivexy.postgresHost" . }}:5432/{{ $pg.postgresql.database }}";
export REDIS_URL="redis://:${REDIS_PASSWORD}@{{ include "vivexy.redisHost" . }}:6379";
export RABBITMQ_URL="amqp://{{ .Values.rabbitmq.auth.username }}:${RABBITMQ_PASSWORD}@{{ include "vivexy.rabbitmqHost" . }}:5672";
{{- end -}}
