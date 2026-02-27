"""
Chat API and SSE stream.
Two-way communication: REST for CRUD, POST /chat/stream for agent streaming.
"""

import asyncio
import json

from flask import Blueprint, Response, jsonify, request
from pydantic import ValidationError
from werkzeug.utils import secure_filename

from app.business_logic.artifacts import (
    create_artifact,
    get_chat_artifacts,
    link_artifacts_to_message,
)
from app.business_logic.attachments import create_attachment, get_chat_attachments
from app.business_logic.chat import (
    create_chat,
    create_message,
    get_chat_messages,
    get_llm_models,
    get_user_chat,
    get_user_chats,
    revert_to_message,
    update_chat,
    update_message,
)
from app.business_logic.todos import (
    create_todo,
    delete_todo,
    get_chat_todos,
    get_todo,
    update_todo,
)
from app.middlewares.auth import auth_middleware
from app.schemas import (
    ArtifactCreate,
    ChatCreate,
    MessageCreate,
    TodoCreate,
    TodoUpdate,
)

bp = Blueprint("chat", __name__, url_prefix="/chat")


@bp.route("", methods=["GET"])
@auth_middleware
def get_chats():
    try:
        user = request.user
        chats = get_user_chats(user.id)
        return jsonify(chats)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("", methods=["POST"])
@auth_middleware
def create_new_chat():
    try:
        user = request.user
        data = request.get_json() or {}
        chat_data = ChatCreate(**data)
        chat = create_chat(chat_data, user.id)
        return jsonify(chat.dict() if hasattr(chat, "dict") else chat), 201
    except ValidationError as e:
        return jsonify({"error": "Invalid input data", "details": e.errors()}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>", methods=["GET"])
@auth_middleware
def get_chat(chat_id):
    try:
        user = request.user
        chat = get_user_chat(chat_id, user.id)
        return jsonify(chat)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/messages", methods=["GET"])
@auth_middleware
def get_messages(chat_id):
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
    """Delete all messages after message_id, reverting the chat to that point."""
    try:
        user = request.user
        count = revert_to_message(chat_id, message_id, user.id)
        return jsonify({"success": True, "deletedCount": count})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/models", methods=["GET"])
@auth_middleware
def get_models():
    try:
        models = get_llm_models()
        return jsonify([m.dict() for m in models])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/artifacts", methods=["GET"])
@auth_middleware
def get_artifacts(chat_id):
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
    try:
        user = request.user
        data = request.get_json()
        artifact_data = ArtifactCreate(**data)
        artifact = create_artifact(chat_id, artifact_data, user.id)
        return jsonify(artifact), 201
    except ValidationError as e:
        return jsonify({"error": "Invalid input data", "details": e.errors()}), 400
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/todos", methods=["GET"])
@auth_middleware
def get_todos(chat_id):
    try:
        user = request.user
        todos = get_chat_todos(chat_id, user.id)
        return jsonify(todos)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/todos", methods=["POST"])
@auth_middleware
def create_new_todo(chat_id):
    try:
        user = request.user
        data = request.get_json()
        todo_data = TodoCreate(**data)
        todo = create_todo(chat_id, todo_data, user.id)
        return jsonify(todo), 201
    except ValidationError as e:
        return jsonify({"error": "Invalid input data", "details": e.errors()}), 400
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/todos/<todo_id>", methods=["GET"])
@auth_middleware
def get_single_todo(chat_id, todo_id):
    try:
        user = request.user
        todo = get_todo(todo_id, chat_id, user.id)
        return jsonify(todo)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/todos/<todo_id>", methods=["PUT", "PATCH"])
@auth_middleware
def update_existing_todo(chat_id, todo_id):
    try:
        user = request.user
        data = request.get_json()
        todo_data = TodoUpdate(**data)
        todo = update_todo(todo_id, chat_id, todo_data, user.id)
        return jsonify(todo)
    except ValidationError as e:
        return jsonify({"error": "Invalid input data", "details": e.errors()}), 400
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/todos/<todo_id>", methods=["DELETE"])
@auth_middleware
def delete_existing_todo(chat_id, todo_id):
    try:
        user = request.user
        delete_todo(todo_id, chat_id, user.id)
        return jsonify({"success": True})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<chat_id>/attachments", methods=["GET"])
@auth_middleware
def get_attachments(chat_id):
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
        from app.services.s3_service import S3Service

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


@bp.route("/stream", methods=["POST"])
@auth_middleware
def stream_chat():
    """SSE stream: agent runs and emits events for the client."""
    try:
        from app.agents.agent_factory import create_langgraph_agent
        from app.agents.config import DEFAULT_AGENT_ID, FileContext
        from app.models import ChatAttachment
        from app.services.file_processor import FileProcessor
        from app.services.s3_service import S3Service
        from app.tools.chat.chat_tools import generate_chat_title_func

        user = request.user
        user_id = user.id
        data = request.get_json() or {}
        chat_id = data.get("chatId")
        messages_data = data.get("messages", [])
        model_id = data.get("modelId")
        model_db_id = data.get("modelDbId")
        model_provider = data.get("modelProvider", "google")
        model_name = data.get("modelName")
        file_ids = data.get("fileIds", [])

        if not chat_id:
            return jsonify({"error": "chatId is required"}), 400
        chat = get_user_chat(chat_id, user_id)
        if not chat:
            return jsonify({"error": "Chat not found"}), 404

        file_contexts = []
        try:
            import os

            if file_ids:
                attachments = ChatAttachment.query.filter(
                    ChatAttachment.id.in_(file_ids),
                    ChatAttachment.chat_id == chat_id,
                ).all()
            else:
                attachments = ChatAttachment.query.filter_by(chat_id=chat_id).all()
            if attachments:
                s3 = S3Service()
                processor = FileProcessor()
                for att in attachments:
                    if not att.s3_key:
                        continue
                    local_path = s3.download_file(att.s3_key)
                    if local_path:
                        try:
                            content = processor.read_file(local_path)
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
                            except Exception:
                                pass
        except Exception as e:
            import traceback

            traceback.print_exc()

        messages = [{"role": m["role"], "content": m["content"]} for m in messages_data]
        if not messages:
            return jsonify({"error": "messages are required"}), 400

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
        update_chat(
            chat_id,
            {"last_model_id": model_db_id, "agent_id": DEFAULT_AGENT_ID},
            user_id,
        )

        agent = create_langgraph_agent(
            DEFAULT_AGENT_ID, model_provider, model_id, chat_id
        )
        from flask import current_app

        app_context = current_app.app_context()

        def generate():
            app_context.push()
            try:
                yield f"data: {json.dumps({'type': 'start'})}\n\n"
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                full_content = ""
                reasoning_steps = []
                agent_done_data = None

                async def get_next():
                    try:
                        return await async_gen.__anext__()
                    except StopAsyncIteration:
                        return None

                try:
                    async_gen = agent.stream_simple(
                        messages, file_contexts if file_contexts else None
                    )
                    while True:
                        event = loop.run_until_complete(get_next())
                        if event is None:
                            break
                        if event.type == "done":
                            agent_done_data = event.data or {}
                            continue
                        event_dict = {"type": event.type, "data": event.data}
                        if event.type == "content":
                            full_content += (
                                event.data if isinstance(event.data, str) else ""
                            )
                        elif event.type == "reasoning":
                            reasoning_steps.append(event.data)
                        elif event.type == "approval_request":
                            event_dict["requires_approval"] = True
                        if getattr(event, "message_id", None):
                            event_dict["messageId"] = event.message_id
                        yield f"data: {json.dumps(event_dict)}\n\n"
                finally:
                    loop.close()

                assistant_message = create_message(
                    chat_id,
                    {
                        "role": "assistant",
                        "content": full_content,
                        "model_id": model_db_id,
                        "reasoning": reasoning_steps,
                    },
                    user_id,
                )
                try:
                    link_artifacts_to_message(chat_id, assistant_message["id"], user_id)
                except Exception as e:
                    print(f"Warning: link_artifacts_to_message: {e}")

                message_count = len(messages_data)
                if message_count == 1 and saved_user_message:
                    # Title generation is handled by the agent via set_chat_title tool.
                    # As a fallback only, if the chat still has no meaningful title after
                    # streaming, we skip — the agent should have set it already.
                    pass

                done_event = {
                    "type": "done",
                    "messageId": assistant_message["id"],
                    "userMessageId": (
                        saved_user_message.get("id") if saved_user_message else None
                    ),
                    "data": {
                        **(agent_done_data or {}),
                        "refetch": ["artifacts", "todos"],
                    },
                }
                yield f"data: {json.dumps(done_event)}\n\n"
            except Exception as e:
                import traceback

                traceback.print_exc()
                yield f"data: {json.dumps({'type': 'error', 'data': {'message': str(e)}})}\n\n"
            finally:
                yield "data: [DONE]\n\n"
                app_context.pop()

        return Response(
            generate(),
            mimetype="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
        )
    except Exception as e:
        import traceback

        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
