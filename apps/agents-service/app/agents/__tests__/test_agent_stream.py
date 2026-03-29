import json
import os
import sys
import tempfile
import uuid
from typing import Any, Dict, List, Optional, Tuple

try:
    import pytest
except ModuleNotFoundError:  # pragma: no cover
    # Allow running the script via `python test_agent_stream.py` even when
    # pytest isn't installed in the current env.
    class _DummyPytest:  # type: ignore
        class mark:  # type: ignore
            @staticmethod
            def integration(fn):
                return fn

        @staticmethod
        def skip(_msg: str):
            raise SystemExit(0)

    pytest = _DummyPytest()  # type: ignore
from flask import Flask

sys.path.insert(
    0,
    os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ),
)

from app.__init__ import create_app
from app.agents.config import DEFAULT_AGENT_ID, FileContext
from app.business_logic.chat import create_chat, create_message, update_chat
from app.business_logic.streaming import run_agent_stream
from app.constants.stream_events import (
    STREAM_EVENT_APPROVAL_REQUEST,
    STREAM_EVENT_CONTENT,
    STREAM_EVENT_DONE,
    STREAM_EVENT_PHASE_CHANGE,
    STREAM_EVENT_REASONING,
    STREAM_EVENT_TOOL_CALL,
)
from app.models import Artifact, ChatAttachment, LLMModel, Message, User, db
from app.models.enums import ArtifactType, MessageRole, Role
from app.schemas import ChatCreate
from app.services.file_processor import FileProcessor
from app.services.s3_service import S3Service
from configs.flask_config import Config as BaseConfig


def _run_live_integration(print_events: bool) -> None:
    print("[test] starting live integration test")

    # --- Gate on required external services. ---
    def _require_env(name: str) -> str:
        v = os.getenv(name)
        if not v:
            msg = f"Missing required env var: {name}"
            if "PYTEST_CURRENT_TEST" in os.environ:
                pytest.skip(msg)
            print(f"[skip] {msg}")
            raise SystemExit(0)
        return v

    _require_env("DAYTONA_API_KEY")
    _require_env("AWS_ACCESS_KEY_ID")
    _require_env("AWS_SECRET_ACCESS_KEY")
    _require_env("AWS_S3_BUCKET_NAME")
    print("[test] required env vars found")

    llm_key = os.getenv("GOOGLE_AI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not llm_key:
        msg = "Missing GOOGLE_AI_API_KEY/GOOGLE_API_KEY for live LLM call"
        if "PYTEST_CURRENT_TEST" in os.environ:
            pytest.skip(msg)
        print(f"[skip] {msg}")
        raise SystemExit(0)

    pinecone_key = os.getenv("PINECONE_API_KEY")
    if not pinecone_key:
        msg = "Missing PINECONE_API_KEY for live rag tools"
        if "PYTEST_CURRENT_TEST" in os.environ:
            pytest.skip(msg)
        print(f"[skip] {msg}")
        raise SystemExit(0)
    print("[test] pinecone key ok")

    # --- Test setup (isolated sqlite DB). ---
    tmp_dir = tempfile.mkdtemp(prefix="agent-stream-live-")
    db_path = os.path.join(tmp_dir, f"test-{uuid.uuid4().hex}.sqlite3")
    print(f"[test] tmp sqlite={db_path}")

    class TestConfig(BaseConfig):
        TESTING = True
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{db_path}"
        SQLALCHEMY_TRACK_MODIFICATIONS = False

    app: Flask = create_app(TestConfig)
    print("[test] flask app created")

    tests_dir = os.path.dirname(os.path.abspath(__file__))
    csv_files = [
        ("daily_pnl_rows.csv", "text/csv"),
        ("investor_transactions.csv", "text/csv"),
    ]

    # --- Create DB rows. ---
    with app.app_context():
        print("[test] creating db schema...")
        db.create_all()
        print("[test] db schema created")

        user_id = str(uuid.uuid4())
        db.session.add(
            User(
                id=user_id,
                email=f"it-{uuid.uuid4().hex[:8]}@example.com",
                name="Integration Test User",
                password="test-password",
                role=Role.USER,
            )
        )

        model_db_id = f"llm-{uuid.uuid4().hex[:10]}"
        db.session.add(
            LLMModel(
                id=model_db_id,
                name="test-live",
                provider="google",
                model_id="gemini-2.5-flash",
                is_active=True,
            )
        )
        db.session.commit()

        chat_resp = create_chat(
            ChatCreate(title="New Chat", agent_id=DEFAULT_AGENT_ID), user_id
        )
        chat_id = chat_resp.id
        print(f"[test] created chat_id={chat_id}")

        # --- Upload CSV attachments to real S3 (keys must include chat_id). ---
        s3 = S3Service()
        print("[test] uploading CSV attachments to S3...")

        for csv_filename, mime_type in csv_files:
            csv_path = os.path.join(tests_dir, csv_filename)
            if not os.path.exists(csv_path):
                print(f"[test] WARNING: {csv_path} not found, skipping")
                continue
            csv_size = os.path.getsize(csv_path)
            with open(csv_path, "rb") as f_csv:
                upload_res = s3.upload_file(
                    file=f_csv,
                    chat_id=chat_id,
                    filename=csv_filename,
                    content_type=mime_type,
                )
            db.session.add(
                ChatAttachment(
                    chat_id=chat_id,
                    filename=csv_filename,
                    s3_key=upload_res["s3_key"],
                    mime_type=mime_type,
                    size=csv_size,
                )
            )
            print(f"[test] uploaded {csv_filename}")

        db.session.commit()
        print("[test] attachments uploaded + ChatAttachment rows committed")

        file_ids: List[str] = [
            str(a.id) for a in ChatAttachment.query.filter_by(chat_id=chat_id).all()
        ]

        print("[test] building file_contexts with live debug logging...", flush=True)

        # Inline equivalent of `build_file_contexts()` but with visibility into
        # where it hangs: S3 download vs. FileProcessor parsing.
        s3 = S3Service()
        processor = FileProcessor()
        file_contexts: List[FileContext] = []

        attachments = ChatAttachment.query.filter(
            ChatAttachment.id.in_(file_ids),
            ChatAttachment.chat_id == chat_id,
        ).all()

        print(f"[test] attachments found={len(attachments)}", flush=True)

        for idx, att in enumerate(attachments, start=1):
            if not att.s3_key:
                print(
                    f"[test] [{idx}/{len(attachments)}] skip: empty s3_key", flush=True
                )
                continue
            print(
                f"[test] [{idx}/{len(attachments)}] download filename={att.filename} s3_key={att.s3_key}",
                flush=True,
            )
            local_path = s3.download_file(att.s3_key)
            print(
                f"[test] [{idx}/{len(attachments)}] downloaded to local_path={local_path}",
                flush=True,
            )
            if not local_path:
                continue

            try:
                print(
                    f"[test] [{idx}/{len(attachments)}] parsing with FileProcessor...",
                    flush=True,
                )
                content = processor.read_file(local_path)
                print(
                    f"[test] [{idx}/{len(attachments)}] parsed type={content.get('type')} text_len={len(content.get('text','') or '')}",
                    flush=True,
                )
                file_contexts.append(
                    FileContext(
                        file_id=str(att.id),
                        filename=att.filename,
                        file_type=content.get("type", "unknown"),
                        content=content.get("text", ""),
                        s3_key=att.s3_key,
                        metadata={"mime_type": att.mime_type},
                    )
                )
            finally:
                try:
                    os.unlink(local_path)
                    print(
                        f"[test] [{idx}/{len(attachments)}] cleaned local_path",
                        flush=True,
                    )
                except Exception:
                    pass

        assert file_contexts, "Expected file_contexts to be built from S3 downloads"
        print(f"[test] built file_contexts count={len(file_contexts)}", flush=True)

        user_content = (
            "I have uploaded two CSV files:\n"
            "- daily_pnl_rows.csv — daily PnL rows with columns: date, "
            "daily_pnl_excluding_mgmt_fees_and_setup_fees, equity_urgl, direct_expenses, "
            "setup_fees, other_expenses, tax, management_fees_class_a, allocated_pnl_class_a, "
            "daily_closing_nav_before_mgmt_fees_class_a, daily_closing_nav_class_a\n"
            "- investor_transactions.csv — investor transactions with columns: "
            "investor_id, transaction_type, transaction_date, units, nav\n\n"
            "Please generate two Excel reports:\n\n"
            "Report 1 — daily_pnl_report.xlsx (sheet: 'Daily PnL Summary'):\n"
            "Columns: date | daily_pnl_excluding_mgmt_fees_and_setup_fees | "
            "equity_urgl | direct_expenses | setup_fees | other_expenses | tax | "
            "management_fees_class_a | daily_closing_nav_class_a\n"
            "Sort by date ascending. Highlight rows where "
            "daily_pnl_excluding_mgmt_fees_and_setup_fees is negative in red.\n\n"
            "Report 2 — investor_summary.xlsx (sheet: 'Investor Summary'):\n"
            "Aggregate investor_transactions.csv by transaction_date and transaction_type. "
            "Columns: transaction_date | Subscriptions (total units) | Redemptions (total units) | Net Units\n\n"
            "Use list_sandbox_files to confirm files are available, execute_code with pandas "
            "and openpyxl to build the reports, then call upload_sandbox_file_to_chat for each file."
        )

        # Mimic `/chat/stream` behavior: save user message first, then run streaming.
        saved_user_message = create_message(
            chat_id,
            {"role": "user", "content": user_content, "model_id": model_db_id},
            user_id,
            skip_auto_response=True,
        )
        update_chat(
            chat_id,
            {"last_model_id": model_db_id, "agent_id": DEFAULT_AGENT_ID},
            user_id,
        )

        def _parse_frame(frame: str) -> Optional[Dict[str, Any]]:
            frame = frame.strip()
            if not frame.startswith("data:"):
                return None
            payload_str = frame[len("data:") :].strip()
            if payload_str in ("[DONE]", ""):
                return None
            try:
                payload = json.loads(payload_str)
            except Exception:
                return None
            if isinstance(payload, dict) and "type" in payload:
                return payload
            return None

        def _print_event(payload: Dict[str, Any]) -> None:
            event_type = payload.get("type")
            data = payload.get("data") or {}

            def _truncate_str(s: Optional[str], limit: int = 2000) -> str:
                if s is None:
                    return ""
                if not isinstance(s, str):
                    s = str(s)
                if len(s) <= limit:
                    return s
                return s[:limit] + f"...(truncated {len(s) - limit} chars)"

            def _json_preview(obj: Any, limit: int = 2500) -> str:
                try:
                    s = json.dumps(obj, default=str, ensure_ascii=False)
                except Exception:
                    s = str(obj)
                return _truncate_str(s, limit=limit)

            if event_type == STREAM_EVENT_TOOL_CALL:
                tool = data.get("tool")
                inp = data.get("input")
                out = data.get("output")
                out_preview = _truncate_str(out, limit=4000)
                print(f"[stream] tool_call tool={tool}")
                if inp is not None:
                    print(f"[stream] tool_call input={_json_preview(inp, limit=2500)}")
                if out_preview:
                    print(f"[stream] tool_call output_preview={out_preview}")
                return

            if event_type == STREAM_EVENT_PHASE_CHANGE:
                print(f"[stream] phase_change data={_json_preview(data, limit=2000)}")
                return

            if event_type == STREAM_EVENT_APPROVAL_REQUEST:
                print(
                    f"[stream] approval_request tool={data.get('tool_name')} request_id={data.get('request_id')}"
                )
                return

            if event_type == STREAM_EVENT_CONTENT:
                # Content is high-volume; only show a short preview.
                chunk = data if isinstance(data, str) else data.get("content")
                if isinstance(chunk, str) and chunk.strip():
                    print(f"[stream] content_preview={_truncate_str(chunk, limit=800)}")
                return

            if event_type == STREAM_EVENT_REASONING:
                if isinstance(data, dict) and data.get("thought"):
                    print(
                        f"[stream] reasoning thought={_truncate_str(data.get('thought'), limit=600)}"
                    )
                    if data.get("tool_calls"):
                        print(
                            f"[stream] reasoning tool_calls={_json_preview(data.get('tool_calls'), limit=2500)}"
                        )
                else:
                    print("[stream] reasoning")
                return

            if event_type == STREAM_EVENT_DONE:
                print(f"[stream] done data={_json_preview(data, limit=2000)}")
                return

            print(f"[stream] {event_type} data={_json_preview(data, limit=2000)}")

        frames: List[str] = []
        for frame in run_agent_stream(
            chat_id=chat_id,
            user_id=user_id,
            messages=[{"role": "user", "content": user_content}],
            model_id="gemini-2.5-flash",
            model_db_id=model_db_id,
            model_provider="google",
            file_contexts=file_contexts,
            client_tools_enabled=False,
            saved_user_message=saved_user_message,
            app_context=app.app_context(),
        ):
            if len(frames) == 0:
                print("[test] first SSE frame received; streaming running...")
            frames.append(frame)
            if not print_events:
                continue
            payload = _parse_frame(frame)
            if payload is not None:
                _print_event(payload)

        events = [_parse_frame(f) for f in frames]
        events = [e for e in events if e is not None]

        # Collect tool names from tool_call events (JSON tool responses).
        tool_calls = [
            e.get("data", {}).get("tool")
            for e in events
            if e.get("type") == STREAM_EVENT_TOOL_CALL
        ]

        # Also collect tool names from reasoning events — more reliable because
        # plain-text tool responses (execute_code, list_sandbox_files) may not
        # always surface as tool_call events depending on the streaming pipeline.
        reasoning_tool_calls = [
            call.get("tool")
            for e in events
            if e.get("type") == STREAM_EVENT_REASONING
            for call in (e.get("data", {}).get("tool_calls") or [])
        ]

        all_tools_called = set(t for t in tool_calls + reasoning_tool_calls if t)

        # Assert sandbox produced an assistant message.
        assistant_msg = (
            Message.query.filter_by(chat_id=chat_id, role=MessageRole.ASSISTANT)
            .order_by(Message.created_at.desc())
            .first()
        )
        assert assistant_msg is not None, "Expected assistant message after stream"

        # Check XLSX artifacts — primary expected output.
        xlsx_artifacts = (
            Artifact.query.filter_by(
                chat_id=chat_id,
                type=ArtifactType.XLSX,
            )
            .order_by(Artifact.created_at.desc())
            .all()
        )

        all_artifacts = (
            Artifact.query.filter_by(chat_id=chat_id)
            .order_by(Artifact.created_at.desc())
            .all()
        )

        print(f"[test] total artifacts={len(all_artifacts)}")
        for a in all_artifacts:
            print(f"[test]   artifact filename={a.filename} type={a.type} seq={a.seq}")

        if not xlsx_artifacts:
            print(
                "[warning] No XLSX artifacts found — agent may not have produced Excel reports"
            )
        else:
            print(f"[test] PASS: {len(xlsx_artifacts)} XLSX artifact(s) produced")

        # Diagnostic: confirm key tools were called.
        print(f"[test] tools called (all sources): {sorted(all_tools_called)}")

        if not any("list_sandbox" in t for t in all_tools_called):
            print(
                "[warning] list_sandbox_files was not called — agent may not have discovered files"
            )
        else:
            print("[test] PASS: list_sandbox_files was called")

        if not any("execute" in t for t in all_tools_called):
            print(
                "[warning] execute_code was not called — agent did not use the sandbox"
            )
        else:
            print("[test] PASS: execute_code was called")

        if not any("upload" in t for t in all_tools_called):
            print(
                "[warning] upload_sandbox_file_to_chat was not called — no files were uploaded"
            )
        else:
            print("[test] PASS: upload_sandbox_file_to_chat was called")

    # Best-effort cleanup of sqlite only (S3 artifacts kept for inspection).
    try:
        import shutil

        shutil.rmtree(tmp_dir)
    except Exception:
        pass


@pytest.mark.integration
def test_agent_stream_live_s3_files_and_sandbox_report_generation() -> None:
    _run_live_integration(print_events=True)


if __name__ == "__main__":
    # Allow running by hand with `python test_agent_stream.py`.
    _run_live_integration(print_events=True)
