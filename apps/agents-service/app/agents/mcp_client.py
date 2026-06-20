"""
HTTP MCP client — connects to remote MCP servers and wraps their tools as LangChain tools.
Each MCP server URL is configured via environment variables (MCP_<NAME>_URL).
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional

import httpx
from langchain_core.tools import BaseTool, tool
from pydantic import create_model

logger = logging.getLogger(__name__)

MCP_SERVER_URLS: Dict[str, Optional[str]] = {
    "market-data": os.getenv("MCP_MARKET_DATA_URL"),
    "document-parser": os.getenv("MCP_DOCUMENT_PARSER_URL"),
    "document-generator": os.getenv("MCP_DOCUMENT_GENERATOR_URL"),
    "sec-edgar": os.getenv("MCP_SEC_EDGAR_URL"),
    "sanctions-screening": os.getenv("MCP_SANCTIONS_SCREENING_URL"),
    "news-feed": os.getenv("MCP_NEWS_FEED_URL"),
    "legal-db": os.getenv("MCP_LEGAL_DB_URL"),
    "regulatory-feeds": os.getenv("MCP_REGULATORY_FEEDS_URL"),
    "workflow-engine": os.getenv("MCP_WORKFLOW_ENGINE_URL"),
    "chart-generator": os.getenv("MCP_CHART_GENERATOR_URL"),
}

MCP_API_KEY = os.getenv("MCP_API_KEY", "")


def _list_tools(base_url: str) -> List[Dict[str, Any]]:
    """Call the MCP server's tool listing endpoint."""
    headers = {"Authorization": f"Bearer {MCP_API_KEY}"} if MCP_API_KEY else {}
    resp = httpx.post(
        f"{base_url.rstrip('/')}/",
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
        headers=headers,
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get("result", {}).get("tools", [])


def _call_tool(base_url: str, tool_name: str, arguments: Dict[str, Any]) -> str:
    """Call a specific tool on the MCP server."""
    headers = {"Authorization": f"Bearer {MCP_API_KEY}"} if MCP_API_KEY else {}
    resp = httpx.post(
        f"{base_url.rstrip('/')}/",
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments},
        },
        headers=headers,
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    content = data.get("result", {}).get("content", [])
    if isinstance(content, list) and content:
        first = content[0]
        if isinstance(first, dict) and first.get("type") == "text":
            return first.get("text", "")
    return json.dumps(data.get("result", {}))


def get_mcp_tools_for_server(server_name: str) -> List[BaseTool]:
    """Return LangChain tools for all tools exposed by the named MCP server."""
    base_url = MCP_SERVER_URLS.get(server_name)
    if not base_url:
        logger.debug("MCP server '%s' not configured (no URL set)", server_name)
        return []

    try:
        tool_defs = _list_tools(base_url)
    except Exception as e:
        logger.warning(
            "Could not reach MCP server '%s' at %s: %s", server_name, base_url, e
        )
        return []

    tools: List[BaseTool] = []
    for td in tool_defs:
        t_name = td.get("name", "")
        t_desc = td.get("description", f"MCP tool from {server_name}")
        input_schema = td.get("inputSchema", {})
        if not t_name:
            continue

        namespaced = f"mcp__{server_name.replace('-', '_')}__{t_name}"
        properties = (
            input_schema.get("properties", {}) if isinstance(input_schema, dict) else {}
        )
        field_defs: Dict[str, Any] = {k: (Optional[str], None) for k in properties}
        DynamicInput = create_model(f"{namespaced}_input", **field_defs)

        _url = base_url
        _t_name = t_name

        @tool(namespaced, args_schema=DynamicInput)
        def _mcp_tool(**kwargs) -> str:
            return _call_tool(
                _url, _t_name, {k: v for k, v in kwargs.items() if v is not None}
            )

        _mcp_tool.description = t_desc  # type: ignore[attr-defined]
        tools.append(_mcp_tool)
        logger.debug(
            "Registered MCP tool '%s' from server '%s'", namespaced, server_name
        )

    return tools
