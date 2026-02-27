"""
Artifact creation tool for the agent.
Creates artifacts (e.g. markdown reports, code snippets) and persists them to the chat.
"""

import json
from typing import Optional

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from app.models import Chat, ArtifactType
from app.business_logic.artifacts import create_artifact
from app.schemas import ArtifactCreate


class CreateArtifactInput(BaseModel):
    title: Optional[str] = Field(None, description="Title of the artifact")
    type: str = Field("MD", description="Type: MD, HTML, JS, TXT, JSON, CSV")
    filename: Optional[str] = Field(None, description="Optional filename")
    language: Optional[str] = Field(None, description="Language for code (e.g. python, javascript)")
    content: str = Field(..., description="Full content of the artifact (markdown, HTML, code, etc.)")


def create_artifact_func(chat_id: str, input_data: dict) -> str:
    """
    Create an artifact for the chat. Returns JSON with success and artifact payload for streaming.
    """
    try:
        chat = Chat.query.filter_by(id=chat_id).first()
        if not chat:
            return json.dumps({"success": False, "error": "Chat not found"})

        user_id = chat.user_id
        artifact_type_str = (input_data.get("type") or "MD").upper()
        try:
            artifact_type = ArtifactType(artifact_type_str)
        except ValueError:
            artifact_type = ArtifactType.MD

        data = ArtifactCreate(
            chat_id=chat_id,
            message_id=None,
            title=input_data.get("title") or (input_data.get("filename") or "Untitled"),
            type=artifact_type,
            filename=input_data.get("filename"),
            language=input_data.get("language"),
            version=1,
            seq=1,
            content=input_data.get("content", ""),
            metadata=None,
        )
        artifact = create_artifact(chat_id, data, user_id)

        return json.dumps({
            "success": True,
            "artifact": {
                "id": artifact["id"],
                "chatId": artifact["chatId"],
                "title": artifact["title"],
                "type": artifact["type"],
                "filename": artifact.get("filename"),
                "language": artifact.get("language"),
                "content": artifact["content"],
                "seq": artifact["seq"],
                "createdAt": artifact["createdAt"],
            },
        })
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})


def get_artifact_creation_tool(chat_id: str) -> StructuredTool:
    """Return the create_artifact LangChain tool bound to this chat."""
    return StructuredTool.from_function(
        name="create_artifact",
        description="Create an artifact (report, code, markdown document) and attach it to this chat. Use for summaries, code snippets, or generated documents.",
        func=lambda **kwargs: create_artifact_func(chat_id, kwargs),
        args_schema=CreateArtifactInput,
    )
