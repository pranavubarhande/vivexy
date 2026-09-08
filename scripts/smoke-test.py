#!/usr/bin/env python3
"""
Post-deploy smoke test: register -> login -> create chat -> start a chat
turn -> read the SSE stream until it completes.

Usage:
  SMOKE_TEST_BASE_URL=https://api.<host> python scripts/smoke-test.py
  SMOKE_TEST_BASE_URL=https://api.<host> SMOKE_TEST_MODEL_PROVIDER=google \
    SMOKE_TEST_MODEL_ID=gemini-2.5-flash python scripts/smoke-test.py

Exits non-zero on any failure.
"""
import json
import os
import sys
import uuid

import requests

BASE = os.environ.get("SMOKE_TEST_BASE_URL", "").rstrip("/")
MODEL_ID = os.environ.get("SMOKE_TEST_MODEL_ID", "gemini-2.5-flash")
MODEL_PROVIDER = os.environ.get("SMOKE_TEST_MODEL_PROVIDER", "google")
SSE_TIMEOUT = int(os.environ.get("SMOKE_TEST_SSE_TIMEOUT", "60"))

if not BASE:
    print("SMOKE_TEST_BASE_URL is required, e.g. https://api.example.com", file=sys.stderr)
    sys.exit(2)


def step(name, fn):
    print(f"[smoke-test] {name} ...", end=" ", flush=True)
    try:
        result = fn()
        print("OK")
        return result
    except Exception as e:
        print(f"FAILED: {e}")
        sys.exit(1)


def register(session):
    email = f"smoketest+{uuid.uuid4().hex[:10]}@example.com"
    password = "Sm0keTest-" + uuid.uuid4().hex[:12]
    r = session.post(
        f"{BASE}/auth/register",
        json={"name": "Smoke Test", "email": email, "password": password},
        timeout=15,
    )
    r.raise_for_status()
    body = r.json()
    if "token" not in body:
        raise RuntimeError(f"no token in register response: {body}")
    return email, password


def login(session, email, password):
    r = session.post(
        f"{BASE}/auth/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    r.raise_for_status()
    body = r.json()
    if "token" not in body:
        raise RuntimeError(f"no token in login response: {body}")
    return body["token"]


def create_chat(session):
    r = session.post(f"{BASE}/chat", json={"title": "smoke-test"}, timeout=15)
    r.raise_for_status()
    body = r.json()
    if "id" not in body:
        raise RuntimeError(f"no id in create-chat response: {body}")
    return body["id"]


def start_chat(session, chat_id):
    r = session.post(
        f"{BASE}/chat/start",
        json={
            "chat_id": chat_id,
            "messages": [{"role": "user", "content": "Say 'ok' and nothing else."}],
            "model_id": MODEL_ID,
            "model_provider": MODEL_PROVIDER,
        },
        timeout=15,
    )
    r.raise_for_status()
    body = r.json()
    if "streamId" not in body:
        raise RuntimeError(f"no streamId in chat/start response: {body}")
    return body["streamId"]


def read_stream_until_done(session, stream_id):
    r = session.get(
        f"{BASE}/chat/events/{stream_id}", stream=True, timeout=SSE_TIMEOUT
    )
    r.raise_for_status()
    for line in r.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data:"):
            continue
        payload = line[len("data:") :].strip()
        try:
            evt = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if evt.get("type") == "error":
            raise RuntimeError(f"server error event: {evt.get('data')}")
        if evt.get("type") == "done":
            return
    raise RuntimeError("stream ended without a done event")


def main():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})

    email, password = step("register", lambda: register(session))
    token = step("login", lambda: login(session, email, password))
    session.headers["Authorization"] = f"Bearer {token}"

    chat_id = step("create chat", lambda: create_chat(session))
    stream_id = step("start chat turn", lambda: start_chat(session, chat_id))
    step("read SSE stream to completion", lambda: read_stream_until_done(session, stream_id))

    print("[smoke-test] all steps passed")


if __name__ == "__main__":
    main()
