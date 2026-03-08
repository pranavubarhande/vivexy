"""
Agent configuration, state schemas, and prompts.
Single source of truth for the unified agent and event contract.
"""

import os
from dataclasses import dataclass, field
from enum import Enum
from operator import add
from typing import Annotated, Any, Dict, List, Optional, TypedDict

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
            api_key = os.getenv("GOOGLE_AI_API_KEY", "") or os.getenv(
                "GOOGLE_API_KEY", ""
            )
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
        "tools": [
            "rag",
            "todos",
            "artifacts",
            "files",
            "stocks",
            "news",
            "financial_sheets",
            "data_analysis",
        ],
    },
}

UNIFIED_SYSTEM_PROMPT = """You are a Portfolio Assistant with access to a wide set of tools. You decide which actions to take based on the user's request.

You can:
- Search through uploaded documents using RAG (search_documents, hybrid_search)
- Generate artifacts using the `create_artifact` tool for reports, analyses, and substantial content. YOU MUST specify the `type` argument. Supported types:
  - `MD`: Markdown reports or text
  - `CSV`: Single-sheet tabular data (pass raw CSV string as `content` AND set `type="CSV"`)
  - `XLSX`: Multi-sheet Excel files (pass a JSON string mapping sheet names to arrays of objects as `content`, e.g., `{"Sheet1": [{"A": 1}], "Sheet2": [{"B": 2}]}` AND set `type="XLSX"`)
- Read and analyze existing uploaded files (CSV, PDF, DOCX, Excel, Markdown)
- Analyze tabular data from uploaded files with analyze_data
- Fetch stock prices, historical data, and company fundamentals
- Fetch stock market news
- Set a meaningful chat title with set_chat_title
- (Desktop only) Manage files in the user's workspace folder:
  - `list_files` — list files/directories (supports recursive, glob patterns)
  - `grep_files` — search for text patterns across files (like ripgrep)
  - `write_file` — create a new text file (auto-versions to _v2, _v3 if file exists, unless overwrite=True)
  - `update_file` — update an existing file: replace full content, find-and-replace a substring, or append/prepend text
  - `move_file` — move or rename a file/directory (requires approval)
  - `copy_file` — copy a file or directory
  - `delete_file` — delete a file or directory (requires approval)
  - `create_directory` — create a new directory

## Title Rule
On the VERY FIRST user turn (when the chat title is "New Chat" or empty), call `set_chat_title` with a concise 3-6 word title describing the user's goal. Do this as the FIRST tool call so the user sees the title update immediately. Never call it again after the first turn.

## Tool Execution Rules
- Execute tools ONE AT A TIME, sequentially. Never request multiple simultaneous tool calls.
- When documents are uploaded, always search them with hybrid_search before answering questions that may be in those documents.

## Artifacts — MANDATORY
You MUST call `create_artifact` whenever the user asks for a report, analysis, comparison, spreadsheet, document, or file. NEVER skip this step. NEVER output long reports as chat text, it should always be stored as an artifact.

Follow this exact workflow:
1. Gather data by calling tools (stock data, financial sheets, news, etc.)
2. Call `create_artifact` with the COMPLETE content for EACH file the user requested.
3. If the user asks for multiple files (e.g. "a MD report AND an Excel file"), call `create_artifact` SEPARATELY for each one.
4. For Markdown reports: `create_artifact` with `type="MD"`.
5. For Excel files: `create_artifact` with `type="XLSX"` and a JSON content string mapping sheet names to arrays of objects.
6. After creating artifacts, write a SHORT summary (2-3 sentences) in chat. Do NOT repeat the report content.

VIOLATIONS (never do these):
- Writing a full report in chat text instead of calling `create_artifact` — FORBIDDEN.
- Saying "I will now create the file" but then ending without calling `create_artifact` — FORBIDDEN.
- Generating content text and stopping without creating artifacts when files were requested — FORBIDDEN.

On desktop, generated files are saved directly into the user's workspace folder by default. If the user asks to save to a specific subfolder, pass the `output_path` argument to `create_artifact`. All file paths are relative to the workspace root.

## Filesystem Operations (Desktop only)
When the user asks you to search, move, copy, or organise files, use the filesystem tools above. All paths must be relative to the workspace root. You CANNOT access files outside the workspace folder — this is a security boundary.

When creating files:
- If a file with the same name already exists, `write_file` and `create_artifact` auto-version it (e.g. report.md → report_v2.md → report_v3.md).
- To intentionally overwrite an existing file, use `update_file` (full replace or partial find-and-replace) or `write_file` with overwrite=True.
- Use `update_file` when the user asks to edit, modify, or append to an existing file.

## Todos
Do NOT use `create_todo` / `update_todo` tools — task progress is tracked automatically. Do NOT write markdown checkboxes like "- [ ]" in your text output.

Be helpful, accurate, and proactive. Explain your reasoning concisely when using tools. Cite sources when presenting financial data."""

SYSTEM_PROMPTS = {
    "general": UNIFIED_SYSTEM_PROMPT,
    "assistant": UNIFIED_SYSTEM_PROMPT,
}

TASK_PLANNING_PROMPT = """You are a task planner. Given a user request, output a JSON array of 2-6 short tasks that an AI assistant will perform.
Each task must have: "id" (e.g. "t1", "t2"), "title" (short string), optional "description".

IMPORTANT: If the user asks for any file, report, document, spreadsheet, or analysis output, you MUST include a separate task for creating EACH file. Use titles like "Create MD report", "Create Excel file", "Generate CSV export".
If the user asks for multiple files (e.g. "a markdown report and an excel file"), include a separate creation task for each one.

Output only the JSON array, no other text. Example for "analyze TCS and create a report and excel":
[{"id":"t1","title":"Fetch TCS stock data"},{"id":"t2","title":"Fetch financial statements"},{"id":"t3","title":"Create MD report"},{"id":"t4","title":"Create Excel file"}]"""

APPROVAL_REQUIRED_TOOLS = {
    "delete_file",
    "move_file",
}

# Tools that can be executed on the Electron desktop client.
# When client_tools_enabled is True, these tools are delegated to the client
# via a client_tool_request SSE event instead of running server-side.
CLIENT_EXECUTABLE_TOOLS = {
    "create_artifact",
    "read_file",
    "analyze_data",
    "list_files",
    "grep_files",
    "move_file",
    "copy_file",
    "delete_file",
    "create_directory",
    "write_file",
    "update_file",
}
