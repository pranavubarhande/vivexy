#!/usr/bin/env python3
"""
Concurrent chat load test against the vivexy agents-service.

Simulates N concurrent "users", each of whom:
  1. Registers a unique account -> JWT
  2. Creates a chat
  3. POSTs a short message to /chat/start -> stream_id (this enqueues to
     RabbitMQ's chat_jobs queue, which is what KEDA scales the worker
     Deployment on)
  4. Reads the SSE stream at /chat/events/<stream_id> until it completes,
     timing end-to-end latency (dispatch -> full response).

Usage:
  python concurrent_chat_load_test.py --base-url http://<LB_IP_or_host> \
      --host api.example.com --concurrency 20
"""
import argparse
import json
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

SHORT_PROMPTS = [
    "Say hello in one short sentence.",
    "What is 2+2? Answer in one word.",
    "Name one color. One word only.",
    "What day comes after Monday? One word.",
    "Say 'ok' and nothing else.",
]


def make_session(base_url: str, host: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({"Host": host, "Content-Type": "application/json"})
    return s


def run_one_user(
    base_url: str, host: str, user_idx: int, sse_timeout: int, model_id: str, model_provider: str
) -> dict:
    session = make_session(base_url, host)
    result = {
        "user": user_idx,
        "ok": False,
        "stage": None,
        "error": None,
        "dispatch_latency_s": None,
        "total_latency_s": None,
    }
    t_start = time.monotonic()
    try:
        # 1. Register
        email = f"loadtest-{uuid.uuid4().hex[:12]}@example.com"
        r = session.post(
            f"{base_url}/auth/register",
            data=json.dumps({"name": f"loadtest{user_idx}", "email": email, "password": "LoadTest1234!"}),
            timeout=15,
        )
        result["stage"] = "register"
        r.raise_for_status()
        token = r.json()["token"]
        session.headers["Authorization"] = f"Bearer {token}"

        # 2. Create chat
        r = session.post(f"{base_url}/chat", data=json.dumps({"title": f"loadtest-{user_idx}"}), timeout=15)
        result["stage"] = "create_chat"
        r.raise_for_status()
        chat_id = r.json()["id"]

        # 3. Start chat (dispatch)
        prompt = SHORT_PROMPTS[user_idx % len(SHORT_PROMPTS)]
        t_dispatch_start = time.monotonic()
        r = session.post(
            f"{base_url}/chat/start",
            data=json.dumps(
                {
                    "chat_id": chat_id,
                    "messages": [{"role": "user", "content": prompt}],
                    "model_id": model_id,
                    "model_provider": model_provider,
                }
            ),
            timeout=15,
        )
        result["stage"] = "chat_start"
        r.raise_for_status()
        stream_id = r.json()["streamId"]
        result["dispatch_latency_s"] = time.monotonic() - t_dispatch_start

        # 4. Read SSE until a "done" event
        result["stage"] = "sse_stream"
        r = session.get(f"{base_url}/chat/events/{stream_id}", stream=True, timeout=sse_timeout)
        r.raise_for_status()
        done = False
        for line in r.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data:"):
                continue
            payload = line[len("data:") :].strip()
            try:
                evt = json.loads(payload)
                if evt.get("type") == "done":
                    done = True
                    break
                if evt.get("type") == "error":
                    result["error"] = f"server error event: {evt.get('data')}"
                    break
            except json.JSONDecodeError:
                continue
        result["ok"] = done
        if not done and result["error"] is None:
            result["error"] = "stream ended without a done event"
    except Exception as e:
        result["error"] = f"{type(e).__name__}: {e}"
    finally:
        result["total_latency_s"] = time.monotonic() - t_start
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", required=True, help="e.g. http://34.70.250.180")
    ap.add_argument("--host", required=True, help="Host header, e.g. api.example.com")
    ap.add_argument("--concurrency", type=int, default=20)
    ap.add_argument("--sse-timeout", type=int, default=90, help="max seconds to wait for one chat response")
    ap.add_argument("--model-id", default="gemini-2.5-flash")
    ap.add_argument("--model-provider", default="google")
    ap.add_argument("--out", default=None, help="optional path to write raw JSON results")
    args = ap.parse_args()

    print(f"Starting load test: concurrency={args.concurrency} base_url={args.base_url} host={args.host}")
    t0 = time.monotonic()
    results = []
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = [
            pool.submit(
                run_one_user, args.base_url, args.host, i, args.sse_timeout, args.model_id, args.model_provider
            )
            for i in range(args.concurrency)
        ]
        for fut in as_completed(futures):
            res = fut.result()
            results.append(res)
            status = "OK" if res["ok"] else f"FAIL@{res['stage']}"
            print(
                f"  user {res['user']:>3}: {status:>12}  total={res['total_latency_s']:.2f}s  "
                f"dispatch={res['dispatch_latency_s']}  err={res['error']}"
            )

    wall_s = time.monotonic() - t0
    ok = [r for r in results if r["ok"]]
    fail = [r for r in results if not r["ok"]]

    print("\n=== Summary ===")
    print(f"Wall time: {wall_s:.2f}s")
    print(f"Total: {len(results)}  OK: {len(ok)}  FAIL: {len(fail)}")
    if ok:
        totals = sorted(r["total_latency_s"] for r in ok)
        dispatches = sorted(r["dispatch_latency_s"] for r in ok if r["dispatch_latency_s"] is not None)

        def pct(lst, p):
            if not lst:
                return None
            k = int(len(lst) * p)
            k = min(k, len(lst) - 1)
            return lst[k]

        print(
            f"End-to-end latency (s): min={totals[0]:.2f} p50={pct(totals,0.5):.2f} "
            f"p90={pct(totals,0.9):.2f} p99={pct(totals,0.99):.2f} max={totals[-1]:.2f}"
        )
        if dispatches:
            print(
                f"Dispatch latency (s):   min={dispatches[0]:.2f} p50={pct(dispatches,0.5):.2f} "
                f"p90={pct(dispatches,0.9):.2f} max={dispatches[-1]:.2f}"
            )
    if fail:
        print("\nFailure breakdown:")
        by_stage = {}
        for r in fail:
            by_stage.setdefault(r["stage"], []).append(r["error"])
        for stage, errs in by_stage.items():
            print(f"  {stage}: {len(errs)} failures, e.g. {errs[0]}")

    if args.out:
        with open(args.out, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nRaw results written to {args.out}")


if __name__ == "__main__":
    main()
