from typing import Any, Dict, List

from app.models import Artifact, Chat, db
from app.schemas import ArtifactCreate, ArtifactResponse


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

    artifact = Artifact(
        chat_id=chat_id,
        message_id=data.message_id,
        title=data.title,
        type=data.type,
        filename=data.filename,
        language=data.language,
        version=data.version,
        seq=next_seq,
        content=data.content,
        artifact_metadata=data.metadata,
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
