#!/usr/bin/env python3
"""
Sustained-throughput stress test for POST /auth/register.

Unlike a fixed-batch load test (fire N concurrent requests, wait for all to
finish), this fires a continuous stream of registration requests for a
fixed WALL-CLOCK duration using a pool of worker threads that each loop
register->register->register until the deadline. Reports realized
requests/sec, latency percentiles, and error breakdown -- the actual
sustained throughput ceiling, not just "can it survive one burst of N".

Usage:
  python registration_stress_test.py --base-url http://<LB_IP_or_host> \
      --host api.example.com --concurrency 50 --duration 90
"""
import argparse
import json
import threading
import time
import uuid

import requests

lock = threading.Lock()
results = []  # (latency_s, ok, error_type, http_status)
stop_flag = threading.Event()


def worker_loop(base_url: str, host: str, worker_id: int):
    session = requests.Session()
    session.headers.update({"Host": host, "Content-Type": "application/json"})
    i = 0
    while not stop_flag.is_set():
        i += 1
        email = f"stress-{worker_id}-{i}-{uuid.uuid4().hex[:8]}@example.com"
        t0 = time.monotonic()
        try:
            r = session.post(
                f"{base_url}/auth/register",
                data=json.dumps(
                    {
                        "name": f"stress{worker_id}-{i}",
                        "email": email,
                        "password": "LoadTest1234!",
                    }
                ),
                timeout=20,
            )
            latency = time.monotonic() - t0
            ok = r.status_code == 201
            err = None if ok else f"HTTP {r.status_code}: {r.text[:150]}"
            with lock:
                results.append((latency, ok, err, r.status_code))
        except Exception as e:
            latency = time.monotonic() - t0
            with lock:
                results.append((latency, False, f"{type(e).__name__}: {e}", None))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", required=True)
    ap.add_argument("--host", required=True)
    ap.add_argument("--concurrency", type=int, default=50)
    ap.add_argument("--duration", type=int, default=60, help="seconds")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    print(
        f"Sustained register stress test: concurrency={args.concurrency} duration={args.duration}s "
        f"base_url={args.base_url}"
    )

    threads = [
        threading.Thread(target=worker_loop, args=(args.base_url, args.host, i), daemon=True)
        for i in range(args.concurrency)
    ]
    t_start = time.monotonic()
    for t in threads:
        t.start()

    # Live progress every 5s
    last_count = 0
    while time.monotonic() - t_start < args.duration:
        time.sleep(5)
        with lock:
            n = len(results)
            ok_n = sum(1 for r in results if r[1])
        elapsed = time.monotonic() - t_start
        window_rate = (n - last_count) / 5.0
        print(
            f"  [{elapsed:5.1f}s] total={n} ok={ok_n} fail={n-ok_n} "
            f"instant_rate={window_rate:.1f}/s cumulative_rate={n/elapsed:.1f}/s"
        )
        last_count = n

    stop_flag.set()
    time.sleep(2)  # let in-flight requests finish/timeout briefly
    wall_s = time.monotonic() - t_start

    with lock:
        final = list(results)

    ok = [r for r in final if r[1]]
    fail = [r for r in final if not r[1]]

    print("\n=== Summary ===")
    print(f"Wall time: {wall_s:.1f}s")
    print(f"Total requests: {len(final)}  OK: {len(ok)}  FAIL: {len(fail)}")
    print(f"Realized throughput: {len(final)/wall_s:.2f} req/s ({len(final)/wall_s*60:.0f} req/min)")
    print(f"Successful throughput: {len(ok)/wall_s:.2f} req/s ({len(ok)/wall_s*60:.0f} req/min)")

    if ok:
        lat = sorted(r[0] for r in ok)

        def pct(p):
            k = min(int(len(lat) * p), len(lat) - 1)
            return lat[k]

        print(
            f"Latency (s): min={lat[0]:.3f} p50={pct(0.5):.3f} p90={pct(0.9):.3f} "
            f"p99={pct(0.99):.3f} max={lat[-1]:.3f}"
        )

    if fail:
        print("\nFailure breakdown:")
        by_type = {}
        for _, _, err, status in fail:
            key = err.split(":")[0] if err else "unknown"
            by_type[key] = by_type.get(key, 0) + 1
        for k, v in sorted(by_type.items(), key=lambda x: -x[1]):
            print(f"  {k}: {v}")

    if args.out:
        with open(args.out, "w") as f:
            json.dump(
                [{"latency_s": r[0], "ok": r[1], "error": r[2], "status": r[3]} for r in final],
                f,
                indent=2,
            )
        print(f"\nRaw results written to {args.out}")


if __name__ == "__main__":
    main()
