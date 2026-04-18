import logging
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List

from app.models import Chat, ChatAttachment, db
from app.services.file_processor import FileProcessor
from app.services.s3_service import S3Service
from app.tools.rag.rag_tools import add_to_knowledge_base_func

try:
    from worker.dispatcher import dispatch_rag_job
except ImportError:
    dispatch_rag_job = None

logger = logging.getLogger(__name__)


def get_chat_attachments(chat_id: str, user_id: str) -> List[Dict[str, Any]]:
    """Get all attachments for a chat."""
    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        raise ValueError("Chat not found")

    attachments = (
        ChatAttachment.query.filter_by(chat_id=chat_id)
        .order_by(ChatAttachment.created_at.desc())
        .all()
    )
    return [_attachment_to_dict(a) for a in attachments]


def create_attachment(
    chat_id: str,
    filename: str,
    mime_type: str,
    size: int,
    user_id: str,
    s3_key: str = None,
) -> Dict[str, Any]:
    """Create a new attachment and trigger background RAG indexing."""
    chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
    if not chat:
        raise ValueError("Chat not found")

    if not s3_key:
        s3_key = f"chats/{chat_id}/files/{uuid.uuid4()}-{filename}"

    attachment = ChatAttachment(
        chat_id=chat_id,
        filename=filename,
        s3_key=s3_key,
        mime_type=mime_type,
        size=size,
    )
    db.session.add(attachment)
    db.session.commit()

    # Dispatch RAG indexing to a background worker if RabbitMQ is available,
    # otherwise fall back to synchronous (in-process) indexing.
    if dispatch_rag_job is not None:
        dispatched = dispatch_rag_job(chat_id=chat_id, s3_key=s3_key, filename=filename)
    else:
        dispatched = False

    if not dispatched:
        _try_index_attachment(chat_id, s3_key, filename)

    return _attachment_to_dict(attachment)


def get_attachment(attachment_id: str, user_id: str) -> Dict[str, Any]:
    """Get a specific attachment."""
    attachment = ChatAttachment.query.filter_by(id=attachment_id).first()
    if not attachment:
        raise ValueError("Attachment not found")

    chat = Chat.query.filter_by(id=attachment.chat_id, user_id=user_id).first()
    if not chat:
        raise ValueError("Attachment not found")

    return _attachment_to_dict(attachment)


def delete_attachment(attachment_id: str, user_id: str) -> bool:
    """Delete an attachment."""
    attachment = ChatAttachment.query.filter_by(id=attachment_id).first()
    if not attachment:
        raise ValueError("Attachment not found")

    chat = Chat.query.filter_by(id=attachment.chat_id, user_id=user_id).first()
    if not chat:
        raise ValueError("Attachment not found")

    db.session.delete(attachment)
    db.session.commit()
    return True


# ------------------------------------------------------------------
# Private helpers
# ------------------------------------------------------------------


def _attachment_to_dict(attachment: ChatAttachment) -> Dict[str, Any]:
    return {
        "id": attachment.id,
        "chatId": attachment.chat_id,
        "filename": attachment.filename,
        "s3Key": attachment.s3_key,
        "mimeType": attachment.mime_type,
        "size": attachment.size,
        "createdAt": attachment.created_at.isoformat(),
    }


def _try_index_attachment(chat_id: str, s3_key: str, filename: str) -> None:
    """
    Download the file from S3 and index it into Pinecone for RAG.
    Runs synchronously but catches all exceptions to avoid blocking the upload response.
    """
    try:
        s3 = S3Service()
        local_path = s3.download_file(s3_key)
        if not local_path:
            return

        try:
            processor = FileProcessor()
            result = processor.read_file(local_path)
            text = result.get("text", "")
            if not text.strip():
                return

            add_to_knowledge_base_func(
                chat_id=chat_id,
                text=text,
                source=filename,
                metadata={"s3_key": s3_key, "filename": filename},
            )
        finally:
            try:
                os.unlink(local_path)
            except Exception:
                pass
    except Exception as e:
        logger.error(
            "[RAG] Failed to index attachment '%s' for chat %s: %s",
            filename,
            chat_id,
            e,
        )
