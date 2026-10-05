from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from agents_core.models.enums import MessageRole


class StreamMessage(BaseModel):
    role: MessageRole
    content: str
    model_id: Optional[str] = None


class StreamRequest(BaseModel):
    chat_id: str
    messages: List[StreamMessage]
    agent_id: str
    model_id: str
    model_db_id: str
    model_provider: str
    model_name: str
    file_ids: Optional[List[str]] = None


class ToolCallEvent(BaseModel):
    tool_name: str
    tool_input: Dict[str, Any]
    requires_approval: bool = False


class ApprovalRequest(BaseModel):
    request_id: str
    tool_name: str
    tool_input: Dict[str, Any]
    description: str


class StreamEvent(BaseModel):
    type: str  # 'content', 'reasoning', 'tool_call', 'approval_request', 'artifact', 'todo', 'done', 'error'
    data: Optional[Any] = None
    message_id: Optional[str] = None
    requires_approval: bool = False
