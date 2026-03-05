"""
Agent Factory
Creates a single unified agent with access to all tools.
"""

from typing import Any, Dict, List, Optional

from composio import Composio
from composio_langchain import LangchainProvider
from langchain_core.tools import BaseTool

from app.agents.base_agent import BaseAgent
from app.agents.config import (
    AGENT_METADATA,
    DEFAULT_AGENT_ID,
    UNIFIED_SYSTEM_PROMPT,
    AgentConfig,
    AgentType,
    FileContext,
)
from app.models.chat import Chat
from app.tools.artifacts.artifact_creation import get_artifact_creation_tool
from app.tools.chat.chat_tools import get_set_chat_title_tool
from app.tools.files.file_tools import get_analyze_data_tool, get_file_read_tool
from app.tools.rag.rag_tools import get_rag_tools
from app.tools.stocks.financial_sheets_tools import get_financial_sheets_tool
from app.tools.stocks.news_tools import get_stock_news_tool
from app.tools.stocks.yahoo_finance_tools import (
    get_stock_quote_tool,
    get_yahoo_finance_historical_tool,
    get_yahoo_finance_quote_summary_tool,
    get_yahoo_finance_quote_tool,
    get_yahoo_finance_search_tool,
)
from app.tools.tasks.task_todos import get_todo_tools


def get_base_tools(chat_id: str) -> List[BaseTool]:
    """
    Get the base tools available to all agents.

    Args:
        chat_id: Chat ID for context-aware tools

    Returns:
        List of base tools
    """
    tools = []

    # Chat management: title setting (agent calls on first user turn)
    try:
        tools.append(get_set_chat_title_tool(chat_id))
    except Exception:
        pass

    # RAG/Search tools
    try:
        tools.extend(get_rag_tools(chat_id))
    except ImportError:
        pass

    # Todo tools
    try:
        tools.extend(get_todo_tools(chat_id))
    except ImportError:
        pass

    # Artifact tools
    try:
        tools.append(get_artifact_creation_tool(chat_id))
    except ImportError:
        pass

    # File tools (basic read operations)
    try:
        tools.append(get_file_read_tool(chat_id))
    except ImportError:
        pass

    return tools


def get_finance_tools() -> List[BaseTool]:
    """Get finance-specific tools (stocks, news, financial sheets)."""
    try:
        return [
            get_stock_quote_tool(),
            get_yahoo_finance_quote_tool(),
            get_yahoo_finance_quote_summary_tool(),
            get_yahoo_finance_historical_tool(),
            get_yahoo_finance_search_tool(),
            get_financial_sheets_tool(),
            get_stock_news_tool(),
        ]
    except ImportError:
        return []


def get_document_tools(chat_id: str) -> List[BaseTool]:
    """Get document-specific tools (e.g. analyze data)."""
    try:
        return [get_analyze_data_tool(chat_id)]
    except ImportError:
        return []


def get_all_tools(chat_id: str) -> List[BaseTool]:
    """
    Get all tools for the unified agent: base + finance + document.
    """
    tools = []
    tools.extend(get_base_tools(chat_id))
    tools.extend(get_finance_tools())
    doc_tools = get_document_tools(chat_id)
    base_names = {t.name for t in tools}

    # Add document tools explicitly
    for t in doc_tools:
        if t.name not in base_names:
            tools.append(t)
            base_names.add(t.name)

    # Add Composio Tools
    composio_tools = get_composio_tools(chat_id)
    for t in composio_tools:
        if t.name not in base_names:
            tools.append(t)
            base_names.add(t.name)

    return tools


def get_composio_tools(chat_id: str) -> List[BaseTool]:
    """Get Composio tools for the user associated with this chat."""
    try:
        chat = Chat.query.get(chat_id)
        if not chat:
            return []

        composio_client = Composio(provider=LangchainProvider())

        # Determine which apps are actively connected by this user
        connections = composio_client.connected_accounts.list(user_ids=[chat.user_id])
        active_toolkits = []
        for conn in connections.items:
            slug = getattr(getattr(conn, "toolkit", None), "slug", None)
            if slug:
                active_toolkits.append(slug)

        if not active_toolkits:
            return []

        return composio_client.tools.get(user_id=chat.user_id, toolkits=active_toolkits)

    except Exception as e:
        import traceback

        print(f"Error loading Composio tools:", e)
        traceback.print_exc()
        return []


def create_langgraph_agent(
    agent_id: str,
    provider: str,
    model_id: str,
    chat_id: str,
    files: Optional[List[FileContext]] = None,
) -> BaseAgent:
    """
    Create the single unified LangGraph agent with access to all tools.
    agent_id is ignored; one agent handles all tasks.
    """
    config = AgentConfig.from_env(provider=provider, model=model_id)
    tools = get_all_tools(chat_id)
    return BaseAgent(
        config=config,
        chat_id=chat_id,
        tools=tools,
        system_prompt=UNIFIED_SYSTEM_PROMPT,
        agent_type=AgentType.GENERAL,
    )


def get_available_agents() -> List[Dict[str, Any]]:
    """Get list of available agents (single unified agent)."""
    return list(AGENT_METADATA.values())
