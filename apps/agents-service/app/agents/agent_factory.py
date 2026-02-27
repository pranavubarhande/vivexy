"""
Agent Factory
Creates a single unified agent with access to all tools.
"""

from typing import Any, Dict, List, Optional

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
from app.tools.artifacts.artifact_creation import get_artifact_creation_tool
from app.tools.chat.chat_tools import get_set_chat_title_tool
from app.tools.files.file_tools import (
    get_analyze_data_tool,
    get_file_read_tool,
    get_file_write_tools,
)
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


def get_file_generation_tools(chat_id: str) -> List[BaseTool]:
    """
    Get file generation tools (write operations).
    These require human approval.
    """
    try:
        return get_file_write_tools(chat_id)
    except ImportError:
        return []


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
    Get all tools for the unified agent: base + file generation + finance + document.
    """
    tools = []
    tools.extend(get_base_tools(chat_id))
    tools.extend(get_file_generation_tools(chat_id))
    tools.extend(get_finance_tools())
    doc_tools = get_document_tools(chat_id)
    base_names = {t.name for t in tools}
    for t in doc_tools:
        if t.name not in base_names:
            tools.append(t)
            base_names.add(t.name)
    return tools


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
