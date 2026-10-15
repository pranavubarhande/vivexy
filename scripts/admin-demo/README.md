# Admin & superadmin demo

Seeds realistic dummy data (6 clients across paid, enterprise, trial,
suspended, churned and free plans; ~60 days of team-attributed usage; a
spend spike; failing scheduled tasks; invites; audit history) and records a
narrated walkthrough of the admin and superadmin panels.

```bash
# 1. Database from the real migrations
createdb vivexy_demo
export DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/vivexy_demo
(cd apps/agents-service && uv run alembic upgrade head)

# 2. Seed and serve (the demo server mounts the real auth/teams/admin/
#    superadmin blueprints; chat endpoints return empty lists)
cd scripts/admin-demo
PYTHONPATH=../../packages/agents-core/src uv run --project ../../apps/agents-service python seed_demo.py
PYTHONPATH=../../packages/agents-core/src uv run --project ../../apps/agents-service python demo_server.py

# 3. Frontend pointed at the demo server
NEXT_PUBLIC_API_URL=http://localhost:5050 npx next dev -p 3100   # in apps/frontend

# 4. Record (needs `pip install playwright`)
python record_walkthrough.py ./out
```

Logins (password `demo-pass-123`): `root@vivexy.com` (super admin),
`support@vivexy.com` (read-only support), `maya@acmelegal.com` (client owner).

The seed script wipes nothing itself — rerun it on a fresh database.
