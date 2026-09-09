# Load tests

Two scripts, plain Python (`requests` + `threading`/`concurrent.futures`,
no framework), matching what was run by hand against a real GKE deployment
during initial development. Both target a Host-header-routed ingress
(`--host`), so they work whether you're hitting a real domain or a raw LB
IP + `Host:` override (e.g. the `sslip.io` workaround documented in
`../k8s/README.md`).

## `registration_stress_test.py` — sustained throughput on `POST /auth/register`

Fires a continuous stream of registrations for a fixed wall-clock duration
(not a fixed batch) — measures the actual sustained ceiling, not just
"can it survive one burst."

```bash
python registration_stress_test.py \
  --base-url http://<LB_IP_or_domain> --host api.example.com \
  --concurrency 50 --duration 90 --out results.json
```

Reports realized/successful req/s, latency percentiles, and a failure
breakdown by error type.

## `concurrent_chat_load_test.py` — N concurrent full chat round-trips

Each simulated user registers, creates a chat, dispatches a short prompt via
`POST /chat/start`, then reads the SSE stream at `/chat/events/<id>` until
completion — end-to-end, including a real LLM call.

```bash
python concurrent_chat_load_test.py \
  --base-url http://<LB_IP_or_domain> --host api.example.com \
  --concurrency 20 --model-id gemini-2.5-flash --model-provider google
```

Reports per-user pass/fail, dispatch latency (time to get a `streamId`
back — this is the queue/dispatch path KEDA scales on) and end-to-end
latency (dispatch through full LLM response) separately, plus a failure
breakdown by stage.

## What these actually measure, and what they don't

Both were used to find real bottlenecks, not just confirm things work:
sustained registration throughput is CPU-bound (bcrypt), not database-bound;
KEDA/HPA scale correctly given headroom, but a fixed (non-autoscaling) node
pool caps how much headroom exists (see `../terraform/`, which fixes that).
Chat load is additionally bounded by whatever LLM provider you point it at
— rate limits and TPM caps are the provider's, not this app's.

Requires `pip install requests` — no other dependencies.
