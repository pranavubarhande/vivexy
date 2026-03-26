import json
import logging
import os
import tempfile
from typing import Any, Dict, List

import markdown2
import pandas as pd
import pypandoc
from docx import Document
from weasyprint import HTML

from app.models import Artifact, Chat, db
from app.models.enums import ArtifactType
from app.schemas import ArtifactCreate
from app.services.s3_service import S3Service

logger = logging.getLogger(__name__)


def resolve_artifact_content(artifact: Artifact) -> str:
    """Return artifact content from DB or by fetching from S3 when stored externally."""
    if artifact.content is not None:
        return artifact.content
    metadata = artifact.artifact_metadata or {}
    s3_key = metadata.get("s3_key")
    if not s3_key:
        return ""
    try:
        s3 = S3Service()
        raw = s3.get_file_content(s3_key)
        if raw is None:
            return ""
        return raw.decode("utf-8")
    except Exception as e:
        logger.warning("Failed to resolve artifact content from S3 %s: %s", s3_key, e)
        return ""


def _get_artifact_url(artifact: Artifact) -> str | None:
    """Generate a presigned download URL for an artifact that has an S3 key."""
    metadata = artifact.artifact_metadata or {}
    s3_key = metadata.get("s3_key")
    if not s3_key:
        return metadata.get("download_url") or metadata.get("url")
    try:
        return S3Service().get_presigned_url(s3_key)
    except Exception as e:
        logger.warning(
            "Failed to generate presigned URL for artifact %s: %s", artifact.id, e
        )
        return metadata.get("download_url") or metadata.get("url")


def get_chat_artifacts(chat_id: str, user_id: str) -> List[Dict[str, Any]]:
    """Get all artifacts for a chat."""

    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        raise ValueError("Chat not found")

    artifacts = (
        Artifact.query.filter_by(chat_id=chat_id).order_by(Artifact.seq.asc()).all()
    )

    return [
        {
            "id": artifact.id,
            "chatId": artifact.chat_id,
            "messageId": artifact.message_id,
            "title": artifact.title,
            "type": artifact.type.value,
            "filename": artifact.filename,
            "language": artifact.language,
            "version": artifact.version,
            "seq": artifact.seq,
            "content": resolve_artifact_content(artifact),
            "url": _get_artifact_url(artifact),
            "metadata": artifact.artifact_metadata,
            "createdAt": artifact.created_at.isoformat(),
        }
        for artifact in artifacts
    ]


def create_artifact(chat_id: str, data: ArtifactCreate, user_id: str) -> Dict[str, Any]:
    """Create a new artifact."""

    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        raise ValueError("Chat not found")

    # Get the next sequence number
    last_artifact = (
        Artifact.query.filter_by(chat_id=chat_id).order_by(Artifact.seq.desc()).first()
    )
    next_seq = last_artifact.seq + 1 if last_artifact else 1

    # Check for existing artifact to increment version
    if data.filename:
        existing = (
            Artifact.query.filter_by(chat_id=chat_id, filename=data.filename)
            .order_by(Artifact.version.desc())
            .first()
        )
    else:
        existing = (
            Artifact.query.filter_by(chat_id=chat_id, title=data.title)
            .order_by(Artifact.version.desc())
            .first()
        )

    version = existing.version + 1 if existing else 1

    metadata = data.metadata or {}
    content_to_store = data.content  # None when we store in S3

    if data.type.value == "XLSX" and data.content:
        try:
            parsed_data = json.loads(data.content)

            with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
                temp_path = f.name

            with pd.ExcelWriter(temp_path) as writer:
                if isinstance(parsed_data, dict):
                    # Multi-sheet Excel
                    for sheet_name, sheet_data in parsed_data.items():
                        df = pd.DataFrame(sheet_data)
                        safe_sheet_name = str(sheet_name)[:31]
                        if not safe_sheet_name:
                            safe_sheet_name = "Sheet"
                        df.to_excel(writer, sheet_name=safe_sheet_name, index=False)
                elif isinstance(parsed_data, list):
                    # Single-sheet Excel
                    df = pd.DataFrame(parsed_data)
                    df.to_excel(writer, sheet_name="Data", index=False)
                else:
                    raise ValueError("Unsupported JSON structure for XLSX")

            s3 = S3Service()
            s3_filename = data.filename or f"{data.title}.xlsx"
            if not s3_filename.endswith(".xlsx"):
                s3_filename += ".xlsx"

            upload_result = s3.upload_generated_file_versioned(
                file_path=temp_path,
                chat_id=chat_id,
                filename=s3_filename,
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            os.unlink(temp_path)

            if upload_result.get("success"):
                metadata["download_url"] = upload_result.get("url")
                metadata["s3_key"] = upload_result.get("s3_key")
                content_to_store = None
        except Exception as e:
            logger.error("Failed to compile XLSX backend artifact: %s", e)

    # Upload MD/CSV to S3 so we don't store content in DB (web path)
    if data.type.value in ("MD", "CSV") and data.content:
        try:
            s3 = S3Service()
            ext = ".md" if data.type.value == "MD" else ".csv"
            s3_filename = data.filename or (data.title or "artifact") + ext
            if not s3_filename.endswith(ext):
                s3_filename += ext
            fd, temp_path = tempfile.mkstemp(suffix=ext)
            try:
                os.write(fd, data.content.encode("utf-8"))
                os.close(fd)
                content_type = (
                    "text/markdown" if data.type.value == "MD" else "text/csv"
                )
                upload_result = s3.upload_generated_file_versioned(
                    file_path=temp_path,
                    chat_id=chat_id,
                    filename=s3_filename,
                    content_type=content_type,
                )
                if upload_result.get("success"):
                    metadata["download_url"] = upload_result.get("url")
                    metadata["s3_key"] = upload_result.get("s3_key")
                    content_to_store = None
            finally:
                try:
                    os.unlink(temp_path)
                except OSError:
                    pass
        except Exception as e:
            logger.warning("Failed to upload artifact to S3, storing in DB: %s", e)

    artifact = Artifact(
        chat_id=chat_id,
        message_id=data.message_id,
        title=data.title,
        type=data.type,
        filename=data.filename,
        language=data.language,
        version=version,
        seq=next_seq,
        content=content_to_store,
        artifact_metadata=metadata,
    )

    db.session.add(artifact)
    db.session.commit()

    return {
        "id": artifact.id,
        "chatId": artifact.chat_id,
        "messageId": artifact.message_id,
        "title": artifact.title,
        "type": artifact.type.value,
        "filename": artifact.filename,
        "language": artifact.language,
        "version": artifact.version,
        "seq": artifact.seq,
        "content": resolve_artifact_content(artifact),
        "url": _get_artifact_url(artifact),
        "metadata": artifact.artifact_metadata,
        "createdAt": artifact.created_at.isoformat(),
    }


def link_artifacts_to_message(chat_id: str, message_id: str, user_id: str) -> int:
    """Link all artifacts in this chat that have no message_id to the given message (e.g. assistant reply). Returns count updated."""
    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        raise ValueError("Chat not found")
    updated = Artifact.query.filter(
        Artifact.chat_id == chat_id, Artifact.message_id.is_(None)
    ).update({"message_id": message_id}, synchronize_session=False)
    db.session.commit()
    return updated


def export_artifact(chat_id: str, artifact_id: str, format: str, user_id: str) -> str:
    """Export an MD artifact to a physical file (PDF or DOCX) on disk, and return the path."""
    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        raise ValueError("Chat not found")

    artifact = Artifact.query.filter_by(id=artifact_id, chat_id=chat_id).first()
    if not artifact:
        raise ValueError("Artifact not found")

    if artifact.type != ArtifactType.MD:
        raise ValueError("Only Markdown artifacts can be exported")

    return export_md_content(resolve_artifact_content(artifact), format)


def export_md_content(content: str, format: str) -> str:
    """Convert raw Markdown content to PDF or DOCX. Returns path to temp file."""
    fmt = format.lower()

    # Generate temp path
    fd, path = tempfile.mkstemp(suffix=f".{fmt}")

    os.close(fd)

    try:
        if fmt == "pdf":
            html_content = markdown2.markdown(
                content, extras=["tables", "fenced-code-blocks", "cuddled-lists"]
            )

            # Very basic styling for WeasyPrint PDF output
            styled_html = f"""
            <html>
                <head>
                    <style>
                        body {{ font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; padding: 2em; color: #333; }}
                        h1 {{ border-bottom: 2px solid #eaecef; padding-bottom: 0.3em; }}
                        h2 {{ border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }}
                        code {{ background-color: #f6f8fa; padding: 0.2em 0.4em; border-radius: 3px; font-family: monospace; }}
                        pre {{ background-color: #f6f8fa; padding: 1em; border-radius: 5px; overflow-x: auto; }}
                        table {{ border-collapse: collapse; width: 100%; margin-top: 1em; margin-bottom: 1em; }}
                        th, td {{ border: 1px solid #dfe2e5; padding: 6px 13px; text-align: right; }}
                        th {{ font-weight: bold; background-color: #f6f8fa; text-align: center; }}
                        blockquote {{ border-left: 4px solid #dfe2e5; padding: 0 1em; color: #6a737d; }}
                    </style>
                </head>
                <body>
                    {html_content}
                </body>
            </html>
            """
            HTML(string=styled_html).write_pdf(target=path)

        elif fmt == "docx":
            # Try to convert md -> docx directly
            try:
                pypandoc.convert_text(content, "docx", format="md", outputfile=path)
            except Exception as outer_e:
                logger.warning(
                    "pypandoc direct convert failed, trying manual fallback: %s",
                    outer_e,
                )
                # Fallback purely text stream using docx if pandoc misses layout
                doc = Document()
                for line in content.split("\n"):
                    doc.add_paragraph(line)
                doc.save(path)
        else:
            raise ValueError(f"Unsupported format: {fmt}")

    except Exception as e:
        os.unlink(path)
        raise Exception(f"Failed to compile document to {fmt}: {str(e)}")

    return path
