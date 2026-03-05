import json
import os
import tempfile
from typing import Any, Dict, List

import markdown2
import pandas as pd
import pypandoc
from weasyprint import HTML

from app.models import Artifact, Chat, db
from app.models.enums import ArtifactType
from app.schemas import ArtifactCreate
from app.services.s3_service import S3Service


def get_chat_artifacts(chat_id: str, user_id: str) -> List[Dict[str, Any]]:
    """Get all artifacts for a chat."""
    # Verify chat belongs to user
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
            "content": artifact.content,
            "metadata": artifact.artifact_metadata,
            "createdAt": artifact.created_at.isoformat(),
        }
        for artifact in artifacts
    ]


def create_artifact(chat_id: str, data: ArtifactCreate, user_id: str) -> Dict[str, Any]:
    """Create a new artifact."""
    # Verify chat belongs to user
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
        except Exception as e:
            print(f"Failed to compile XLSX backend artifact: {e}")

    artifact = Artifact(
        chat_id=chat_id,
        message_id=data.message_id,
        title=data.title,
        type=data.type,
        filename=data.filename,
        language=data.language,
        version=version,
        seq=next_seq,
        content=data.content,
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
        "content": artifact.content,
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

    fmt = format.lower()
    content = artifact.content or ""

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
                print(
                    f"pypandoc direct convert failed, trying manual fallback: {outer_e}"
                )
                # Fallback purely text stream using docx if pandoc misses layout
                from docx import Document

                doc = Document()
                for line in content.split("\\n"):
                    doc.add_paragraph(line)
                doc.save(path)
        else:
            raise ValueError(f"Unsupported format: {fmt}")

    except Exception as e:
        os.unlink(path)
        raise Exception(f"Failed to compile document to {fmt}: {str(e)}")

    return path
