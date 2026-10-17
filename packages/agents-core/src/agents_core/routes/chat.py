"""
Chat API and SSE stream.
Two-way communication: REST for CRUD, POST /chat/start for agent streaming via Redis pub/sub.
"""

import json
import logging
import os
import re
import threading
import uuid as uuid_lib
from dataclasses import asdict

import redis as redis_lib
from agents_core.agents.client_tool_store import resolve_client_tool
from agents_core.agents.config import DEFAULT_AGENT_ID
from agents_core.business_logic.artifacts import (
    create_artifact,
    export_artifact,
    export_md_content,
    get_chat_artifacts,
)
from agents_core.business_logic.attachments import (
    create_attachment,
    get_chat_attachments,
)
from agents_core.business_logic.chat import (
    build_file_contexts,
    build_image_contexts,
    create_chat,
    create_message,
    delete_chat,
    get_chat_messages,
    get_llm_models,
    get_user_chat,
    get_user_chats,
    revert_to_message,
    update_chat,
    update_message,
)
from agents_core.business_logic.streaming import run_agent_stream_to_redis
from agents_core.business_logic.team_policy import (
    check_chat_policy,
    filter_models_for_team,
    resolve_chat_team,
)
from agents_core.constants.redis_keys import REDIS_KEY_STREAM_TOKEN, REDIS_STREAM_CHAT
from agents_core.middlewares.auth import auth_middleware
from agents_core.models.chat import Artifact, Chat
from agents_core.schemas import ArtifactCreate, ChatCreate, MessageCreate
from agents_core.services.s3_service import S3Service
from agents_core.worker.dispatcher import dispatch_chat_job
from flask import (
    Blueprint,
    Response,
    after_this_request,
    current_app,
    jsonify,
    make_response,
    request,
    send_file,
)
from pydantic import ValidationError
from werkzeug.utils import secure_filename

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")


def _get_redis():
    try:
        r = redis_lib.from_url(REDIS_URL, decode_responses=True)
        r.ping()
        return r
    except Exception:
        return None


logger = logging.getLogger(__name__)

bp = Blueprint("chat", __name__, url_prefix="/chat")


@bp.route("", methods=["GET"])
@auth_middleware
def get_chats():
    """List all chats for the authenticated user.
    ---
    tags:
      - Chat
    security:
      - BearerAuth: []
    responses:
      200:
        description: Array of chat objects
        schema:
          type: array
          items:
            type: object
      401:
        description: Unauthorized
    """
    try:
        user = request.user
        chats = get_user_chats(user.id)
        return jsonify(chats)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("", methods=["POST"])
@auth_middleware
def create_new_chat():
    """Create a new chat conversation.
    ---
    tags:
      - Chat
    security:
      - BearerAuth: []
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          properties:
            title:
              type: string
              example: New Conversation
    responses:
      201:
        description: Chat created
      400:
        description: Validation error
      401:
        description: Unauthorized
    """
    try:
        user = request.user
        data = request.get_json() or {}
        chat_data = ChatCreate(**data)
        chat_data.team_id = resolve_chat_team(chat_data.team_id, user)
        chat = create_chat(chat_data, user.id)
        return jsonify(chat.dict() if hasattr(chat, "dict") else chat), 201
    except ValidationError as e:
        return jsonify({"error": "Invalid input data", "details": e.errors()}), 400
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/cancel_tool", methods=["POST"])
@auth_middleware
def cancel_tool_endpoint(chat_id):
    """Set a cancellation flag for a specific running tool.
    ---
    tags:
      - Chat
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: chat_id
        type: string
        required: true
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - tool_name
          properties:
            tool_name:
              type: string
    responses:
      200:
        description: Cancel flag set
      400:
        description: Validation error
      401:
        description: Unauthorized
      404:
        description: Chat not found
    """
    try:
        user = request.user
        data = request.get_json() or {}
        tool_name = data.get("tool_name")
        if not tool_name:
            return jsonify({"error": "tool_name is required"}), 400

        # Verify chat belongs to user
        chat = get_user_chat(chat_id, user.id)
        if not chat:
            return jsonify({"error": "Chat not found"}), 404

        if tool_name not in ["execute_code"]:
            return (
                jsonify({"error": f"Cancellation is not supported for '{tool_name}'"}),
                400,
            )

        from agents_core.agents.cancel_store import set_cancel_flag

        success = set_cancel_flag(chat_id, tool_name)
        if not success:
            return (
                jsonify({"error": "Failed to set cancel flag (Redis might be down)"}),
                500,
            )

        return jsonify(
            {"success": True, "message": f"Cancellation requested for {tool_name}"}
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>", methods=["GET"])
@auth_middleware
def get_chat(chat_id):
    """Get a specific chat by ID.
    ---
    tags:
      - Chat
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: chat_id
        type: string
        required: true
    responses:
      200:
        description: Chat object
      401:
        description: Unauthorized
      404:
        description: Chat not found
    """
    try:
        user = request.user
        chat = get_user_chat(chat_id, user.id)
        return jsonify(chat)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>", methods=["PATCH"])
@auth_middleware
def rename_chat(chat_id):
    """Rename a chat.
    ---
    tags:
      - Chat
    security:
      - BearerAuth: []
    """
    try:
        from agents_core.models.base import db
        from agents_core.models.chat import Chat as ChatModel

        user = request.user
        data = request.get_json() or {}
        chat = ChatModel.query.filter_by(id=chat_id, user_id=user.id).first()
        if not chat:
            return jsonify({"error": "Chat not found"}), 404
        if "title" in data:
            chat.title = data["title"]
        db.session.commit()
        return jsonify({"id": chat.id, "title": chat.title})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>", methods=["DELETE"])
@auth_middleware
def delete_chat_endpoint(chat_id):
    """Delete a chat permanently, including its messages, artifacts and files.
    ---
    tags:
      - Chat
    security:
      - BearerAuth: []
    responses:
      200:
        description: Chat deleted
      404:
        description: Chat not found
    """
    try:
        delete_chat(chat_id, request.user.id)
        return jsonify({"success": True})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        logger.exception("delete_chat error for chat %s", chat_id)
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/project", methods=["GET"])
@auth_middleware
def get_chat_project(chat_id):
    """Get the project this chat belongs to (if any).
    ---
    tags:
      - Chat
    security:
      - BearerAuth: []
    """
    try:
        from agents_core.models.chat import Chat as ChatModel
        from agents_core.models.project import Project, ProjectChat

        user = request.user
        chat = ChatModel.query.filter_by(id=chat_id, user_id=user.id).first()
        if not chat:
            return jsonify({"error": "Chat not found"}), 404
        link = ProjectChat.query.filter_by(chat_id=chat_id).first()
        if not link:
            return jsonify({"project": None})
        project = Project.query.get(link.project_id)
        if not project:
            return jsonify({"project": None})
        return jsonify(
            {
                "project": {
                    "id": project.id,
                    "name": project.name,
                    "color": project.color,
                    "description": project.description,
                    "ownerId": project.owner_id,
                    "createdAt": project.created_at.isoformat(),
                }
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/messages", methods=["GET"])
@auth_middleware
def get_messages(chat_id):
    """Get all messages in a chat.
    ---
    tags:
      - Chat
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: chat_id
        type: string
        required: true
    responses:
      200:
        description: Array of messages
        schema:
          type: array
          items:
            type: object
      401:
        description: Unauthorized
      404:
        description: Chat not found
    """
    try:
        user = request.user
        messages = get_chat_messages(chat_id, user.id)
        return jsonify(messages)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/messages", methods=["POST"])
@auth_middleware
def create_new_message(chat_id):
    """Create a new message in a chat.
    ---
    tags:
      - Chat
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: chat_id
        type: string
        required: true
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - role
            - content
          properties:
            role:
              type: string
              enum: [user, assistant, system]
            content:
              type: string
            model_id:
              type: string
    responses:
      201:
        description: Message created
      400:
        description: Validation error
      401:
        description: Unauthorized
      404:
        description: Chat not found
    """
    try:
        user = request.user
        data = request.get_json()
        message_data = MessageCreate(**data)
        message = create_message(chat_id, message_data, user.id)
        return jsonify(message), 201
    except ValidationError as e:
        return jsonify({"error": "Invalid input data", "details": e.errors()}), 400
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/messages/<message_id>", methods=["PUT"])
@auth_middleware
def update_existing_message(chat_id, message_id):
    """Update an existing message's content.
    ---
    tags:
      - Chat
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: chat_id
        type: string
        required: true
      - in: path
        name: message_id
        type: string
        required: true
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - content
          properties:
            content:
              type: string
            model_id:
              type: string
    responses:
      200:
        description: Message updated
      400:
        description: Content is required
      401:
        description: Unauthorized
      404:
        description: Message not found
    """
    try:
        user = request.user
        data = request.get_json() or {}
        content = data.get("content")
        model_id = data.get("model_id")
        if not content:
            return jsonify({"error": "Content is required"}), 400
        message = update_message(message_id, content, user.id, model_id)
        return jsonify(message)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/messages/<message_id>/revert", methods=["POST"])
@auth_middleware
def revert_to_message_endpoint(chat_id, message_id):
    """Delete all messages after message_id, reverting the chat to that point.
    ---
    tags:
      - Chat
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: chat_id
        type: string
        required: true
      - in: path
        name: message_id
        type: string
        required: true
        description: Revert to this message (all subsequent messages are deleted)
    responses:
      200:
        description: Revert successful
        schema:
          type: object
          properties:
            success:
              type: boolean
            deletedCount:
              type: integer
      401:
        description: Unauthorized
      404:
        description: Chat or message not found
    """
    try:
        user = request.user
        data = request.get_json(silent=True) or {}
        delete_self = bool(data.get("delete_self", False))
        result = revert_to_message(
            chat_id, message_id, user.id, delete_self=delete_self
        )
        return jsonify(
            {
                "success": True,
                "deletedCount": result["deleted_count"],
                "messageContent": result["message_content"],
            }
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/checkpoints", methods=["GET"])
@auth_middleware
def get_checkpoints(chat_id):
    """List all checkpoints for a chat."""
    try:
        user = request.user
        from agents_core.business_logic.chat import get_chat_checkpoints

        checkpoints = get_chat_checkpoints(chat_id, user.id)
        return jsonify(checkpoints)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/checkpoints", methods=["POST"])
@auth_middleware
def create_new_checkpoint(chat_id):
    """Create a manual checkpoint at a message."""
    try:
        user = request.user
        data = request.get_json() or {}
        message_id = data.get("message_id")
        label = data.get("label")
        if not message_id:
            return jsonify({"error": "message_id is required"}), 400
        from agents_core.business_logic.chat import create_checkpoint

        cp = create_checkpoint(chat_id, user.id, message_id, label)
        return jsonify(cp), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/checkpoints/<checkpoint_id>/restore", methods=["POST"])
@auth_middleware
def restore_checkpoint_endpoint(chat_id, checkpoint_id):
    """Restore chat to a checkpoint."""
    try:
        user = request.user
        from agents_core.business_logic.chat import restore_checkpoint

        result = restore_checkpoint(chat_id, checkpoint_id, user.id)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/models", methods=["GET"])
@auth_middleware
def get_models():
    """Get available LLM models.
    ---
    tags:
      - Chat
    security:
      - BearerAuth: []
    responses:
      200:
        description: Array of LLM model objects
        schema:
          type: array
          items:
            type: object
      401:
        description: Unauthorized
    """
    try:
        team_id = request.args.get("teamId")
        models = filter_models_for_team(get_llm_models(), team_id)
        return jsonify([m.dict() for m in models])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/artifacts", methods=["GET"])
@auth_middleware
def get_artifacts(chat_id):
    """Get all artifacts for a chat.
    ---
    tags:
      - Artifacts
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: chat_id
        type: string
        required: true
    responses:
      200:
        description: Array of artifact objects
        schema:
          type: array
          items:
            type: object
      401:
        description: Unauthorized
      404:
        description: Chat not found
    """
    try:
        user = request.user
        artifacts = get_chat_artifacts(chat_id, user.id)
        return jsonify(artifacts)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/artifacts", methods=["POST"])
@auth_middleware
def create_new_artifact(chat_id):
    """Create a new artifact in a chat.
    ---
    tags:
      - Artifacts
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: chat_id
        type: string
        required: true
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - title
            - content
            - type
          properties:
            title:
              type: string
            content:
              type: string
            type:
              type: string
            filename:
              type: string
    responses:
      201:
        description: Artifact created
      400:
        description: Validation error
      401:
        description: Unauthorized
      404:
        description: Chat not found
    """
    try:
        user = request.user
        data = request.get_json()
        artifact_data = ArtifactCreate(**data)

        # TODO: We might have to update the artifact storing logic across desktop and web clients for scalability.
        artifact = create_artifact(chat_id, artifact_data, user.id)
        return jsonify(artifact), 201
    except ValidationError as e:
        return jsonify({"error": "Invalid input data", "details": e.errors()}), 400
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/artifacts/<artifact_id>/export", methods=["GET"])
@auth_middleware
def export_artifact_endpoint(chat_id, artifact_id):
    """Export an artifact as PDF or DOCX.
    ---
    tags:
      - Artifacts
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: chat_id
        type: string
        required: true
      - in: path
        name: artifact_id
        type: string
        required: true
      - in: query
        name: format
        type: string
        enum: [pdf, docx]
        default: pdf
        description: Export format
    produces:
      - application/pdf
      - application/vnd.openxmlformats-officedocument.wordprocessingml.document
    responses:
      200:
        description: Exported file binary
      400:
        description: Invalid format
      401:
        description: Unauthorized
      404:
        description: Artifact not found
    """
    try:
        user = request.user
        fmt = request.args.get("format", "pdf").lower()
        if fmt not in ["pdf", "docx"]:
            return (
                jsonify(
                    {"error": "Invalid format requested. Supported formats: pdf, docx"}
                ),
                400,
            )

        file_path = export_artifact(chat_id, artifact_id, fmt, user.id)

        @after_this_request
        def remove_file(response):
            try:
                os.remove(file_path)
            except Exception as e:
                logger.warning(
                    "Error removing temporary export file %s: %s", file_path, e
                )
            return response

        mimetype = (
            "application/pdf"
            if fmt == "pdf"
            else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        return send_file(
            file_path,
            mimetype=mimetype,
            as_attachment=True,
            download_name=f"artifact_export.{fmt}",
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        logger.exception("export_artifact_endpoint error")
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/artifacts/<artifact_id>/download", methods=["GET"])
@auth_middleware
def download_artifact_endpoint(chat_id, artifact_id):
    """Proxy-download an artifact's raw file from S3, avoiding browser CORS restrictions.
    ---
    tags:
      - Artifacts
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: chat_id
        type: string
        required: true
      - in: path
        name: artifact_id
        type: string
        required: true
    responses:
      200:
        description: Raw file content from S3
      401:
        description: Unauthorized
      404:
        description: Artifact or S3 key not found
      502:
        description: Failed to fetch from S3
    """
    try:
        artifact = Artifact.query.filter_by(id=artifact_id, chat_id=chat_id).first()
        if not artifact:
            return jsonify({"error": "Artifact not found"}), 404

        metadata = artifact.artifact_metadata or {}
        s3_key = metadata.get("s3_key")
        if not s3_key:
            return jsonify({"error": "No S3 key for this artifact"}), 404

        s3 = S3Service()
        raw = s3.get_file_content(s3_key)
        if raw is None:
            return jsonify({"error": "Failed to fetch file from S3"}), 502

        ext = (artifact.filename or "").rsplit(".", 1)[-1].lower()
        mime_map = {
            "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "pdf": "application/pdf",
            "csv": "text/csv",
            "json": "application/json",
            "md": "text/markdown",
            "html": "text/html",
        }
        mimetype = mime_map.get(ext, "application/octet-stream")

        response = make_response(raw)
        response.headers["Content-Type"] = mimetype
        response.headers["Content-Disposition"] = (
            f'inline; filename="{artifact.filename or artifact_id}"'
        )
        return response
    except Exception as e:
        logger.exception("download_artifact_endpoint error")
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/export-content", methods=["POST"])
@auth_middleware
def export_content_endpoint(chat_id):
    """Export markdown content to PDF/DOCX without needing the artifact in DB.
    ---
    tags:
      - Artifacts
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: chat_id
        type: string
        required: true
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - content
          properties:
            content:
              type: string
              description: Markdown content to export
            format:
              type: string
              enum: [pdf, docx]
              default: pdf
    produces:
      - application/pdf
      - application/vnd.openxmlformats-officedocument.wordprocessingml.document
    responses:
      200:
        description: Exported file binary
      400:
        description: Invalid format or missing content
      401:
        description: Unauthorized
    """
    try:
        data = request.get_json() or {}
        content = data.get("content", "")
        fmt = data.get("format", "pdf").lower()

        if fmt not in ["pdf", "docx"]:
            return jsonify({"error": "Supported formats: pdf, docx"}), 400
        if not content:
            return jsonify({"error": "Content is required"}), 400

        file_path = export_md_content(content, fmt)

        mimetype = (
            "application/pdf"
            if fmt == "pdf"
            else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        return send_file(
            file_path,
            mimetype=mimetype,
            as_attachment=True,
            download_name=f"artifact_export.{fmt}",
        )
    except Exception as e:
        logger.exception("export_content_endpoint error")
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/attachments", methods=["GET"])
@auth_middleware
def get_attachments(chat_id):
    """Get all file attachments for a chat.
    ---
    tags:
      - Attachments
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: chat_id
        type: string
        required: true
    responses:
      200:
        description: Array of attachment objects
        schema:
          type: array
          items:
            type: object
      401:
        description: Unauthorized
      404:
        description: Chat not found
    """
    try:
        user = request.user
        attachments = get_chat_attachments(chat_id, user.id)
        return jsonify(attachments)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/attachments", methods=["POST"])
@auth_middleware
def upload_attachment(chat_id):
    """Upload a file attachment to a chat (max 10 MB).
    ---
    tags:
      - Attachments
    security:
      - BearerAuth: []
    consumes:
      - multipart/form-data
    parameters:
      - in: path
        name: chat_id
        type: string
        required: true
      - in: formData
        name: file
        type: file
        required: true
        description: File to upload (max 10 MB)
    responses:
      201:
        description: Attachment created
      400:
        description: No file provided, empty file, or too large
      401:
        description: Unauthorized
      404:
        description: Chat not found
    """
    try:
        user = request.user
        if "file" not in request.files:
            return jsonify({"error": "No file provided"}), 400

        file = request.files["file"]
        if file.filename == "":
            return jsonify({"error": "No file selected"}), 400

        max_size = 10 * 1024 * 1024
        file.seek(0, 2)

        size = file.tell()
        file.seek(0)

        if size > max_size:
            return jsonify({"error": "File too large (max 10MB)"}), 400

        filename = secure_filename(file.filename)
        mime_type = file.mimetype or "application/octet-stream"

        s3 = S3Service()
        s3_result = s3.upload_file(file, chat_id, filename, mime_type)
        s3_key = s3_result.get("s3_key") if s3_result.get("success") else None
        if not s3_key:
            s3_key = f"chats/{chat_id}/files/{filename}"
        attachment = create_attachment(
            chat_id, filename, mime_type, size, user.id, s3_key=s3_key
        )
        return jsonify(attachment), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/start", methods=["POST"])
@auth_middleware
def start_chat_stream():
    """Start agent in a background thread; return stream_id for EventSource subscription.
    ---
    tags:
      - Streaming
    security:
      - BearerAuth: []
    consumes:
      - application/json
      - multipart/form-data
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - chat_id
            - messages
          properties:
            chat_id:
              type: string
            messages:
              type: array
              items:
                type: object
                properties:
                  role:
                    type: string
                  content:
                    type: string
            model_id:
              type: string
            model_db_id:
              type: string
            model_provider:
              type: string
              default: google
            file_ids:
              type: array
              items:
                type: string
            user_skills:
              type: array
              items:
                type: string
            mcp_tools:
              type: array
              items:
                type: object
    responses:
      200:
        description: Stream started, returns stream_id for SSE subscription
        schema:
          type: object
          properties:
            stream_id:
              type: string
      400:
        description: Missing chat_id or messages
      401:
        description: Unauthorized
      404:
        description: Chat not found
      503:
        description: Redis unavailable
    """
    try:
        user = request.user
        user_id = user.id

        is_multipart = request.content_type and request.content_type.startswith(
            "multipart/form-data"
        )
        if is_multipart:
            data = json.loads(request.form.get("data", "{}"))
        else:
            data = request.get_json() or {}

        chat_id = data.get("chat_id")
        messages_data = data.get("messages", [])
        model_id = data.get("model_id")
        model_db_id = data.get("model_db_id")
        model_provider = data.get("model_provider", "google")
        file_ids = data.get("file_ids", [])

        if not chat_id:
            return jsonify({"error": "chat_id is required"}), 400

        get_user_chat(chat_id, user_id)
        try:
            policy = check_chat_policy(Chat.query.get(chat_id), model_db_id)
        except PermissionError as e:
            return jsonify({"error": str(e)}), 403

        if is_multipart:
            files_to_upload = request.files.getlist("files")
            if files_to_upload:
                s3 = S3Service()
                for file in files_to_upload:
                    if file.filename == "":
                        continue
                    filename = secure_filename(file.filename)
                    mime_type = file.mimetype or "application/octet-stream"
                    file.seek(0, 2)
                    size = file.tell()
                    file.seek(0)
                    s3_result = s3.upload_file(file, chat_id, filename, mime_type)
                    s3_key = (
                        s3_result.get("s3_key") if s3_result.get("success") else None
                    )
                    if not s3_key:
                        s3_key = f"chats/{chat_id}/files/{filename}"
                    attachment = create_attachment(
                        chat_id, filename, mime_type, size, user_id, s3_key=s3_key
                    )
                    file_ids.append(str(attachment["id"]))

        file_contexts = []
        image_contexts = []
        client_tools_enabled = (
            request.headers.get("X-Client-Tools", "").lower() == "true"
        )
        user_skills = data.get("user_skills", [])
        mcp_tools = data.get("mcp_tools", [])
        github_context = data.get("github_context")

        # ── GitHub context handling ─────────────────────────────────────
        # 1. If the frontend sends a context, lock it to this chat (first message only).
        # 2. If no context is sent but the chat already has one stored, use that.
        # 3. Attach the live access token for GitHub-type contexts so the
        #    agent factory can clone the repo into the sandbox.
        from agents_core.models.chat import Chat as ChatModel

        chat_record = ChatModel.query.filter_by(id=chat_id).first()

        if github_context:
            # Lock to chat on first message (don't overwrite if already set)
            if chat_record and not chat_record.github_context:
                safe = {k: v for k, v in github_context.items() if k != "access_token"}
                chat_record.github_context = safe
                from agents_core.models.base import db as _db

                _db.session.commit()
        elif chat_record and chat_record.github_context:
            # No context from frontend — fall back to what's stored on the chat
            github_context = dict(chat_record.github_context)

        # Attach live access token for GitHub-type contexts
        if github_context and github_context.get("type") == "github":
            try:
                from agents_core.models.github import GithubConnection

                conn = GithubConnection.query.filter_by(user_id=user_id).first()
                if conn:
                    github_context = dict(github_context)
                    github_context["access_token"] = conn.access_token
            except Exception:
                logger.warning("Could not attach GitHub access token to context")

        try:
            if not client_tools_enabled:
                file_contexts = build_file_contexts(chat_id, file_ids)
                image_contexts = build_image_contexts(chat_id, file_ids)
        except Exception:
            logger.exception("Failed to build file contexts")

        messages = [{"role": m["role"], "content": m["content"]} for m in messages_data]
        if not messages:
            return jsonify({"error": "messages are required"}), 400

        # Server-side /compact interception — prevent it from reaching the LLM

        last_content = messages[-1].get("content", "").strip()
        compact_match = re.match(r"^/compact\s*(.*)?$", last_content, re.IGNORECASE)
        if compact_match:
            focus = (compact_match.group(1) or "").strip() or None
            try:
                from agents_core.business_logic.api_keys import get_decrypted_api_keys
                from agents_core.business_logic.compact import compact_chat

                user_api_keys = get_decrypted_api_keys(user_id) if user_id else {}
                result = compact_chat(
                    chat_id,
                    user_id,
                    model_provider,
                    model_id or "gemini-2.5-flash",
                    user_api_keys=user_api_keys,
                    focus=focus,
                )
                return jsonify(
                    {
                        "compact": True,
                        "success": True,
                        "summary": result["summary"],
                        "compactedCount": result["compacted_count"],
                    }
                )
            except ValueError as e:
                return jsonify({"error": str(e)}), 400
            except Exception as e:
                logger.exception("compact via stream intercepted")
                return jsonify({"error": str(e)}), 500

        local_filenames = data.get("local_filenames", [])
        if client_tools_enabled and local_filenames:
            filenames_str = ", ".join(local_filenames)
            messages.append(
                {
                    "role": "user",
                    "content": (
                        f"[System Context: The user has attached the following local "
                        f"files to this chat: {filenames_str}. You can use the "
                        f"`read_file` and `analyze_data` tools to inspect them if needed.]"
                    ),
                }
            )

        last_msg = messages[-1]
        saved_user_message = create_message(
            chat_id,
            {
                "role": last_msg["role"],
                "content": last_msg["content"],
                "model_id": model_db_id,
            },
            user_id,
            skip_auto_response=True,
        )

        # Link uploaded files to this user message so they appear in chat history
        if file_ids:
            from agents_core.models.base import db as _db
            from agents_core.models.chat import ChatAttachment as _CA

            msg_id = (
                saved_user_message.get("id")
                if isinstance(saved_user_message, dict)
                else getattr(saved_user_message, "id", None)
            )
            if msg_id:
                _CA.query.filter(_CA.id.in_(file_ids), _CA.chat_id == chat_id).update(
                    {"message_id": msg_id}, synchronize_session=False
                )
                _db.session.commit()

        update_chat(
            chat_id,
            {"last_model_id": model_db_id, "agent_id": DEFAULT_AGENT_ID},
            user_id,
        )

        r = _get_redis()
        if not r:
            return jsonify({"error": "Redis unavailable"}), 503

        stream_id = str(uuid_lib.uuid4())
        r.setex(REDIS_KEY_STREAM_TOKEN.format(stream_id=stream_id), 120, user_id)
        stream_key = REDIS_STREAM_CHAT.format(stream_id=stream_id)

        # Primary path: hand the whole agent run off to a worker pod via
        # RabbitMQ. The worker publishes events to the same Redis Stream
        # (keyed by stream_id) that GET /events/<stream_id> below reads from,
        # so it's irrelevant which pod dispatched vs. which pod streams the
        # response back — no sticky sessions, no in-process background thread
        # tying this generation's fate to this web pod's lifetime.
        dispatched = dispatch_chat_job(
            stream_id=stream_id,
            chat_id=chat_id,
            user_id=user_id,
            messages=messages,
            model_id=model_id,
            model_db_id=model_db_id,
            model_provider=model_provider,
            file_context_dicts=[asdict(fc) for fc in file_contexts],
            image_contexts=image_contexts,
            client_tools_enabled=client_tools_enabled,
            saved_user_message=saved_user_message,
            user_skills=user_skills,
            mcp_tools=mcp_tools,
            github_context=github_context,
        )

        if not dispatched:
            # RabbitMQ unavailable or disabled (e.g. local dev without
            # USE_RABBITMQ=true) — degrade to running the agent in a
            # background thread of this request-handling process, same as
            # before this endpoint dispatched to workers.
            logger.warning(
                "RabbitMQ unavailable — running chat job in-process for chat_id=%s",
                chat_id,
            )
            app_ctx = current_app.app_context()

            def _run():
                run_agent_stream_to_redis(
                    stream_id=stream_id,
                    r=r,
                    stream_key=stream_key,
                    chat_id=chat_id,
                    user_id=user_id,
                    messages=messages,
                    model_id=model_id,
                    model_db_id=model_db_id,
                    model_provider=model_provider,
                    file_contexts=file_contexts,
                    image_contexts=image_contexts,
                    client_tools_enabled=client_tools_enabled,
                    saved_user_message=saved_user_message,
                    app_context=app_ctx,
                    user_skills=user_skills,
                    mcp_tools=mcp_tools,
                    github_context=github_context,
                )

            threading.Thread(target=_run, daemon=True).start()

        return jsonify({"stream_id": stream_id, "warnings": policy["warnings"]})

    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        logger.exception("start_chat_stream error")
        return jsonify({"error": str(e)}), 500


@bp.route("/events/<stream_id>", methods=["GET"])
def chat_events(stream_id):
    """SSE relay: reads from Redis stream and sends events to the client.
    ---
    tags:
      - Streaming
    parameters:
      - in: path
        name: stream_id
        type: string
        required: true
        description: Stream ID returned from POST /chat/start
    produces:
      - text/event-stream
    responses:
      200:
        description: SSE event stream (data chunks as JSON)
      404:
        description: Invalid or expired stream
      503:
        description: Redis unavailable
    """
    r = _get_redis()
    if not r:
        return jsonify({"error": "Redis unavailable"}), 503

    if not r.exists(REDIS_KEY_STREAM_TOKEN.format(stream_id=stream_id)):
        return jsonify({"error": "Invalid or expired stream"}), 404

    stream_key = REDIS_STREAM_CHAT.format(stream_id=stream_id)

    def generate():
        last_id = "0"
        token_key = REDIS_KEY_STREAM_TOKEN.format(stream_id=stream_id)
        try:
            while True:
                entries = r.xread({stream_key: last_id}, block=3000, count=100)
                if not entries:
                    if not r.exists(token_key):
                        break
                    continue
                for _, msgs in entries:
                    for msg_id, fields in msgs:
                        last_id = msg_id
                        payload = fields.get("payload", "")
                        if payload == "__done__":
                            return
                        yield f"data: {payload}\n\n"
        except GeneratorExit:
            pass

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@bp.route("/<chat_id>/tool-result", methods=["POST"])
@auth_middleware
def post_tool_result(chat_id):
    """Receive tool execution result from Electron desktop client.
    ---
    tags:
      - Streaming
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: chat_id
        type: string
        required: true
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - request_id
          properties:
            request_id:
              type: string
            result:
              type: string
              default: ""
    responses:
      200:
        description: Result received
        schema:
          type: object
          properties:
            success:
              type: boolean
      400:
        description: Missing request_id
      401:
        description: Unauthorized
    """
    try:
        data = request.get_json() or {}
        request_id = data.get("request_id")
        result = data.get("result", "")

        if not request_id:
            return jsonify({"error": "request_id is required"}), 400

        success = resolve_client_tool(request_id, result)
        return jsonify({"success": success})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/attachments/<attachment_id>/content", methods=["GET"])
def get_attachment_content(chat_id, attachment_id):
    # No auth_middleware — browser <img> tags can't send Authorization headers.
    # Security: chat_id + attachment_id are UUID v4 values (~2^128 space),
    # making enumeration attacks infeasible. The endpoint is read-only.
    """Serve raw attachment content from S3 (used for image previews in chat)."""
    try:
        from agents_core.models.chat import ChatAttachment

        att = ChatAttachment.query.filter_by(id=attachment_id, chat_id=chat_id).first()
        if not att:
            return jsonify({"error": "Attachment not found"}), 404

        s3 = S3Service()
        raw = s3.get_file_content(att.s3_key)
        if raw is None:
            return jsonify({"error": "Failed to fetch from S3"}), 502

        response = make_response(raw)
        response.headers["Content-Type"] = att.mime_type or "application/octet-stream"
        response.headers["Content-Disposition"] = f'inline; filename="{att.filename}"'
        response.headers["Cache-Control"] = "private, max-age=3600"
        return response
    except Exception as e:
        logger.exception("get_attachment_content error")
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/compact", methods=["POST"])
@auth_middleware
def compact_chat_endpoint(chat_id):
    """Compact a chat's context by summarizing older messages.
    ---
    tags:
      - Chat
    security:
      - BearerAuth: []
    parameters:
      - in: path
        name: chat_id
        type: string
        required: true
      - in: body
        name: body
        schema:
          type: object
          properties:
            focus:
              type: string
              description: Optional focus area for the summary
            model_id:
              type: string
              description: Model ID to use for summarization
            model_provider:
              type: string
              default: google
    responses:
      200:
        description: Compaction result
        schema:
          type: object
          properties:
            success:
              type: boolean
            summary:
              type: string
            compactedCount:
              type: integer
      400:
        description: Not enough messages
      401:
        description: Unauthorized
      404:
        description: Chat not found
    """
    try:
        user = request.user
        data = request.get_json() or {}
        focus = data.get("focus")
        model_provider = data.get("model_provider", "google")
        model_id = data.get("model_id", "gemini-2.5-flash")

        from agents_core.business_logic.api_keys import get_decrypted_api_keys
        from agents_core.business_logic.compact import compact_chat

        user_api_keys = get_decrypted_api_keys(user.id) if user.id else {}

        result = compact_chat(
            chat_id,
            user.id,
            model_provider,
            model_id,
            user_api_keys=user_api_keys,
            focus=focus,
        )
        return jsonify(
            {
                "success": True,
                "summary": result["summary"],
                "compactedCount": result["compacted_count"],
            }
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.exception("compact_chat_endpoint error")
        return jsonify({"error": str(e)}), 500
