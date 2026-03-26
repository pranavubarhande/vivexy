import base64
import importlib
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from composio import Composio
from composio_langchain import LangchainProvider
from daytona import CreateSandboxFromSnapshotParams, Daytona
from deepagents import create_deep_agent
from langchain_core.tools import BaseTool, tool
from langchain_daytona import DaytonaSandbox
from langgraph.checkpoint.memory import MemorySaver

from app.agents.config import (
    AGENT_METADATA,
    DEFAULT_AGENT_ID,
    UNIFIED_SYSTEM_PROMPT,
    AgentConfig,
    FileContext,
)
from app.models.chat import Artifact, ChatAttachment
from app.services.s3_service import S3Service
from app.tools.sandbox.daytona_tools import (
    get_execute_code_tool,
    get_upload_sandbox_file_tool,
    install_sandbox_dependencies,
)

logger = logging.getLogger(__name__)

SKILLS_DIR = Path(
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "skills")
)

# Stateful Checkpointer for cross-request chat history
# TODO: MemorySaver is per-process. For production persistence across restarts,
# a database-backed checkpointer should be used.
global_checkpointer = MemorySaver()


def sync_chat_artifacts_to_sandbox(chat_id: str, backend: DaytonaSandbox):
    """Restores previous chat attachments and the latest version of each artifact from S3 back into the sandbox."""
    try:
        s3 = S3Service()

        # Fetch all attachments and artifacts for this chat
        attachments = ChatAttachment.query.filter_by(chat_id=chat_id).all()
        artifacts = Artifact.query.filter_by(chat_id=chat_id).all()

        to_restore = []  # List of (filename, s3_key)
        seen_keys = set()

        # Add attachments (no versioning concept, add all unique)
        for att in attachments:
            if att.s3_key and att.s3_key not in seen_keys:
                to_restore.append((att.filename, att.s3_key))
                seen_keys.add(att.s3_key)

        # For artifacts, keep only the latest version (highest seq) per filename
        filename_to_latest: dict = {}
        for art in artifacts:
            fname = art.filename or art.title or "unnamed_artifact"
            existing = filename_to_latest.get(fname)
            if existing is None or (art.seq or 0) > (existing.seq or 0):
                filename_to_latest[fname] = art

        for fname, art in filename_to_latest.items():
            metadata = art.artifact_metadata or {}
            s3_key = metadata.get("s3_key")
            if s3_key and s3_key not in seen_keys:
                to_restore.append((fname, s3_key))
                seen_keys.add(s3_key)

        if not to_restore:
            return

        logger.info(
            f"Syncing {len(to_restore)} files back to sandbox for chat {chat_id}"
        )

        for filename, s3_key in to_restore:
            try:
                content_bytes = s3.get_file_content(s3_key)
                if content_bytes:
                    b64_data = base64.b64encode(content_bytes).decode("utf-8")
                    safe_filename = filename.replace(" ", "_")
                    backend.execute(f"echo {b64_data} | base64 -d > ./{safe_filename}")
            except Exception as e:
                logger.warning(f"Failed to restore {filename} to sandbox: {e}")

    except Exception as e:
        logger.error(f"Error in sync_chat_artifacts_to_sandbox: {e}")


def safe_import_tool(
    module_path: str, function_name: str, *args, **kwargs
) -> List[BaseTool]:
    """Helper to safely import and execute tool fetch functions."""
    try:
        module = importlib.import_module(module_path)
        func = getattr(module, function_name)
        tool = func(*args, **kwargs)
        if hasattr(tool, "__iter__") and not isinstance(tool, BaseTool):
            return list(tool)
        return [tool] if tool else []
    except (ImportError, AttributeError, Exception) as e:
        logger.warning(f"Failed to load tools from {module_path}.{function_name} — {e}")
        return []


def get_base_tools(chat_id: str) -> List[BaseTool]:
    """Get the base tools available to the main agent."""
    tools = []
    import_list = [
        ("app.tools.chat.chat_tools", "get_set_chat_title_tool", [chat_id]),
        ("app.tools.files.file_tools", "get_file_read_tool", [chat_id]),
    ]
    for module_path, func_name, args in import_list:
        tools.extend(safe_import_tool(module_path, func_name, *args))
    return tools


def get_finance_tools() -> List[BaseTool]:
    """Get finance-specific tools (stocks, news, financial sheets)."""
    tools = []
    import_list = [
        ("app.tools.stocks.yahoo_finance_tools", "get_stock_quote_tool", []),
        ("app.tools.stocks.yahoo_finance_tools", "get_yahoo_finance_quote_tool", []),
        (
            "app.tools.stocks.yahoo_finance_tools",
            "get_yahoo_finance_quote_summary_tool",
            [],
        ),
        (
            "app.tools.stocks.yahoo_finance_tools",
            "get_yahoo_finance_historical_tool",
            [],
        ),
        ("app.tools.stocks.yahoo_finance_tools", "get_yahoo_finance_search_tool", []),
        ("app.tools.stocks.financial_sheets_tools", "get_financial_sheets_tool", []),
        ("app.tools.stocks.news_tools", "get_stock_news_tool", []),
    ]
    for module_path, func_name, args in import_list:
        tools.extend(safe_import_tool(module_path, func_name, *args))
    return tools


def get_document_tools(chat_id: str) -> List[BaseTool]:
    """Get document-specific tools (e.g. analyze data, RAG)."""
    tools = []
    tools.extend(
        safe_import_tool(
            "app.tools.files.file_tools", "get_analyze_data_tool", [chat_id]
        )
    )
    tools.extend(
        safe_import_tool("app.tools.rag.rag_tools", "get_rag_tools", [chat_id])
    )
    return tools


def get_composio_tools(chat_id: str, user_id: Optional[str] = None) -> List[BaseTool]:
    """Get Composio tools for the user associated with this chat."""
    try:
        if not user_id:
            return []
        composio_client = Composio(provider=LangchainProvider())
        connections = composio_client.connected_accounts.list(user_ids=[user_id])
        active_toolkits = []
        for conn in connections.items:
            slug = getattr(getattr(conn, "toolkit", None), "slug", None)
            if slug:
                active_toolkits.append(slug)
        if not active_toolkits:
            return []
        return composio_client.tools.get(user_id=user_id, toolkits=active_toolkits)
    except Exception as e:
        logger.exception("Error loading Composio tools: %s", e)
        return []


def create_agent(
    agent_id: str,
    provider: str,
    model_id: str,
    chat_id: str,
    files: Optional[List[FileContext]] = None,
    client_tools_enabled: bool = False,
    user_id: Optional[str] = None,
):
    """
    Create the single unified LangGraph agent using deepagents.
    """
    ag_config = AgentConfig.from_env(provider=provider, model=model_id)

    # 1. Base tools for the main agent
    tools = get_base_tools(chat_id)
    tools.extend(get_composio_tools(chat_id, user_id))

    # Optional client filesystem execution tools
    if client_tools_enabled:
        fs_tools = safe_import_tool("app.tools.files.fs_tools", "get_fs_tools")
        existing_names = set(t.name for t in tools)
        for t in fs_tools:
            if t.name not in existing_names:
                tools.append(t)
                existing_names.add(t.name)

    # 2. Subagents configuration
    finance_subagent = {
        "name": "finance_analyst",
        "description": "Analyzes stock market data, fetches stock quotes, historical data, financial sheets, and news.",
        "system_prompt": "You are a financial analyst. Fetch requested stock data, fundamentals, or news accurately. Return a concise summary to the main agent.",
        "tools": get_finance_tools(),
    }

    research_subagent = {
        "name": "researcher",
        "description": "Reads and analyzes documents, and searches files using RAG.",
        "system_prompt": "You are a thorough researcher. Look into the documents and files context using the RAG and data analysis tools to answer questions.",
        "tools": get_document_tools(chat_id),
    }

    # 3. Sandbox backend
    try:
        params = CreateSandboxFromSnapshotParams(
            ephemeral=True,
            auto_stop_interval=5,  # The ephemeral sandbox will be deleted after 5 minutes of inactivity
        )
        sandbox = Daytona().create(params=params)
        backend = DaytonaSandbox(sandbox=sandbox)

        # Install skills dependencies on sandbox boot
        install_sandbox_dependencies(backend)

        # Register the upload and execute tools explicitly
        tools.append(get_upload_sandbox_file_tool(backend, chat_id))
        tools.append(get_execute_code_tool(backend))

        # 4. Restore previous artifacts to the sandbox
        sync_chat_artifacts_to_sandbox(chat_id, backend)
    except Exception as e:
        logger.warning(f"Failed to initialize Daytona sandbox: {e}")
        sandbox = None
        backend = None

    # 5. Agent Checkpointer
    checkpointer = global_checkpointer

    if ag_config.api_key:
        if ag_config.provider == "google":
            os.environ["GOOGLE_API_KEY"] = ag_config.api_key
        elif ag_config.provider == "openai":
            os.environ["OPENAI_API_KEY"] = ag_config.api_key

    # Build complete model provider string required by deepagents (e.g. google_genai:gemini-2.5-flash)
    provider_str = (
        f"google_genai:{ag_config.model}"
        if ag_config.provider == "google"
        else f"openai:{ag_config.model}"
    )

    # Generate system prompt
    final_prompt = UNIFIED_SYSTEM_PROMPT
    if files:
        parts = []
        for f in files:
            content = f.content[:3000] if len(f.content) > 3000 else f.content
            parts.append(f"File: {f.filename} ({f.file_type})\n{content}")
        file_ctx = "\n\n---\n\n".join(parts)
        final_prompt += f"\n\n[File Context]\n{file_ctx}"

    # Ensure skills directory exists
    SKILLS_DIR.mkdir(parents=True, exist_ok=True)

    agent = create_deep_agent(
        model=provider_str,
        tools=tools,
        backend=backend,
        subagents=[finance_subagent, research_subagent],
        skills=[str(SKILLS_DIR)],
        checkpointer=checkpointer,
        interrupt_on={
            "delete_file": {"allowed_decisions": ["approve", "reject"]},
            "move_file": {"allowed_decisions": ["approve", "reject"]},
        },
        system_prompt=final_prompt,
    )

    # Store sandbox instance into the agent object for cleanup if necessary
    agent.__sandbox = sandbox
    return agent


# Alias for backward compatibility
create_langgraph_agent = create_agent


def get_available_agents() -> List[Dict[str, Any]]:
    return list(AGENT_METADATA.values())
