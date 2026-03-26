from dataclasses import dataclass, field
from operator import add
from typing import Annotated, Any, Dict, List, Optional, TypedDict

from langchain_core.messages import BaseMessage

from app.enum.agent_enums import TaskStatus


@dataclass
class TaskItem:
    id: str
    title: str
    description: Optional[str] = None
    status: str = TaskStatus.PENDING.value
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "status": self.status,
            "error": self.error,
        }


@dataclass
class FileContext:
    file_id: str
    filename: str
    file_type: str
    content: str
    s3_key: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolCall:
    tool_name: str
    tool_input: Dict[str, Any]
    tool_output: Optional[str] = None
    requires_approval: bool = False
    approved: Optional[bool] = None
    error: Optional[str] = None


@dataclass
class ReasoningStep:
    thought: str
    tool_calls: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class ApprovalRequest:
    request_id: str
    tool_name: str
    tool_input: Dict[str, Any]
    description: str
    created_at: str


class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], add]
    chat_id: str
    files: List[FileContext]
    current_query: str
    iteration: int
    max_iterations: int
    pending_tool_calls: List[ToolCall]
    completed_tool_calls: List[ToolCall]
    requires_human_approval: bool
    approval_request: Optional[ApprovalRequest]
    final_response: str
    reasoning_steps: List[ReasoningStep]
    created_todos: List[Dict[str, Any]]
    created_artifacts: List[Dict[str, Any]]
    error: Optional[str]
    should_end: bool
