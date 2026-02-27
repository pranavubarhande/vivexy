"""
Agent configuration, state schemas, and prompts.
Single source of truth for the unified agent and event contract.
"""

import os
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, TypedDict, Annotated
from enum import Enum
from operator import add

from langchain_core.messages import BaseMessage


class AgentType(Enum):
    GENERAL = "general"


class AgentPhase(Enum):
    PLANNING = "planning"
    SEARCHING = "searching"
    EXECUTING = "executing"
    GENERATING = "generating"
    DONE = "done"


class TaskStatus(Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    DONE = "DONE"
    ERROR = "ERROR"


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
class AgentConfig:
    api_key: str
    model: str = "gemini-2.5-flash"
    provider: str = "google"
    temperature: float = 0.7
    max_tokens: int = 8192
    max_iterations: int = 12
    embedding_model: str = "all-MiniLM-L6-v2"

    @classmethod
    def from_env(cls, provider: str = "google", model: str = "gemini-2.5-flash"):
        if provider == "google":
            api_key = os.getenv("GOOGLE_AI_API_KEY", "") or os.getenv("GOOGLE_API_KEY", "")
        elif provider == "openai":
            api_key = os.getenv("OPENAI_API_KEY", "")
        elif provider == "anthropic":
            api_key = os.getenv("ANTHROPIC_API_KEY", "")
        elif provider == "groq":
            api_key = os.getenv("GROQ_API_KEY", "")
        else:
            api_key = ""
        return cls(api_key=api_key, model=model, provider=provider)


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


DEFAULT_AGENT_ID = "assistant"

AGENT_METADATA = {
    DEFAULT_AGENT_ID: {
        "id": DEFAULT_AGENT_ID,
        "name": "Portfolio Assistant",
        "description": "Your AI assistant for portfolio tasks: stocks, documents, tasks, and files.",
        "icon": "🤖",
        "color": "#6366f1",
        "tools": ["rag", "todos", "artifacts", "files", "stocks", "news", "financial_sheets", "data_analysis"],
    },
}

UNIFIED_SYSTEM_PROMPT = """You are a Portfolio Assistant with access to a wide set of tools. You decide which actions to take based on the user's request.

You can:
- Search through uploaded documents using RAG (search_documents, hybrid_search)
- Create and manage todos/tasks; mark tasks done when completed
- Generate artifacts (reports, code, documents) with create_artifact
- Read, analyze, and create files (CSV, PDF, DOCX, Excel, Markdown) — file writes require user approval
- Analyze tabular data from uploaded files with analyze_data
- Fetch stock prices, historical data, and company fundamentals
- Fetch stock market news
- Set a meaningful chat title with set_chat_title

## Title Rule
On the VERY FIRST user turn (when the chat title is "New Chat" or empty), call `set_chat_title` with a concise 3-6 word title describing the user's goal. Do this as the FIRST tool call so the user sees the title update immediately. Never call it again after the first turn.

## Tool Execution Rules
- Execute tools ONE AT A TIME, sequentially. Never request multiple simultaneous tool calls.
- For file-write tools (write_csv, write_xlsx, write_pdf, write_docx, write_md), always inform the user what you are about to create and wait for approval before proceeding.
- When documents are uploaded, always search them with hybrid_search before answering questions that may be in those documents.

## Todos & Artifacts
When you identify actionable items, create todos and mark them done as you complete them. When generating substantial content, create an artifact so the user can view it in the Artifacts panel.

Be helpful, accurate, and proactive. Explain your reasoning concisely when using tools. Cite sources when presenting financial data."""

SYSTEM_PROMPTS = {
    "general": UNIFIED_SYSTEM_PROMPT,
    "assistant": UNIFIED_SYSTEM_PROMPT,
}

TASK_PLANNING_PROMPT = """You are a task planner. Given a user request, output a JSON array of 2-6 short tasks that an AI assistant will perform.
Each task must have: "id" (e.g. "t1", "t2"), "title" (short string), optional "description".
Output only the JSON array, no other text. Example:
[{"id":"t1","title":"Search uploaded documents"},{"id":"t2","title":"Summarize findings"}]"""

APPROVAL_REQUIRED_TOOLS = {
    "write_csv",
    "write_xlsx",
    "write_pdf",
    "write_docx",
    "write_md",
    "delete_file",
}
