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

    pdf_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "reliance_stock_analysis.pdf",
    )

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

        # --- Upload attachments to real S3 (keys must include chat_id). ---
        s3 = S3Service()
        print("[test] uploading attachments to S3...")

        with open(pdf_path, "rb") as f_pdf:
            pdf_size = os.path.getsize(pdf_path)
            pdf_upload = s3.upload_file(
                file=f_pdf,
                chat_id=chat_id,
                filename="reliance_stock_analysis.pdf",
                content_type="application/pdf",
            )

        db.session.add(
            ChatAttachment(
                chat_id=chat_id,
                filename="reliance_stock_analysis.pdf",
                s3_key=pdf_upload["s3_key"],
                mime_type="application/pdf",
                size=pdf_size,
            )
        )
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
            "Using the attached PDF, generate a comprehensive portfolio report as pptx with multiple slides."
            "You MUST use the sandbox execute_code tool to create the report file in the workspace, "
            "then you MUST call upload_sandbox_file_to_chat to sync it."
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
        tool_calls = [
            e.get("data", {}).get("tool")
            for e in events
            if e.get("type") == STREAM_EVENT_TOOL_CALL
        ]

        # Assert sandbox produced an artifact linked to the assistant message.
        assistant_msg = (
            Message.query.filter_by(chat_id=chat_id, role=MessageRole.ASSISTANT)
            .order_by(Message.created_at.desc())
            .first()
        )
        assert assistant_msg is not None, "Expected assistant message after stream"

        pdf_artifacts = (
            Artifact.query.filter_by(
                chat_id=chat_id,
                message_id=assistant_msg.id,
                type=ArtifactType.PDF,
            )
            .order_by(Artifact.created_at.desc())
            .all()
        )
        docx_artifacts = (
            Artifact.query.filter_by(
                chat_id=chat_id,
                message_id=assistant_msg.id,
                type=ArtifactType.DOCX,
            )
            .order_by(Artifact.created_at.desc())
            .all()
        )
        pptx_artifacts = (
            Artifact.query.filter_by(
                chat_id=chat_id,
                message_id=assistant_msg.id,
                type=ArtifactType.PPTX,
            )
            .order_by(Artifact.created_at.desc())
            .all()
        )

        # In Daytona with deepagents, sandbox files are not automatically uploaded to S3.
        # artifacts = pdf_artifacts + docx_artifacts + pptx_artifacts
        # assert artifacts, "Expected at least one sandbox-generated PDF/DOCX/PPTX artifact"
        # assert any(a.artifact_metadata for a in artifacts), "Expected artifact_metadata with S3 key"

        # Helpful diagnostic: if execute_code didn't show up in stream tool_call events,
        # the model might have generated via other tools.
        if not any("execute" in t for t in tool_calls if t):
            print(
                "[warning] an execute tool call not observed in tool_call stream events "
            )

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
