"""
Web Search Tools
LangChain tools for web searching using Exa (LLM-friendly open source search API).
"""

import os
from typing import Any, Dict, List

from exa_py import Exa
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

EXA_API_KEY = os.getenv("EXA_API_KEY")


class WebSearchInput(BaseModel):
    """Input for web search"""

    query: str = Field(..., description="The search query")
    num_results: int = Field(
        5, description="Number of search results to return (default 5, max 20)"
    )
    search_type: str = Field(
        "auto",
        description=(
            "Search type: 'auto' (best for LLM), 'news' (recent news), "
            "'deep' (comprehensive)"
        ),
    )


class WebSearchWithContentsInput(BaseModel):
    """Input for web search with full content retrieval"""

    query: str = Field(..., description="The search query")
    num_results: int = Field(
        5, description="Number of search results to return (default 5, max 10)"
    )
    contents: bool = Field(
        True, description="Whether to fetch full content from each result"
    )


def web_search_func(
    query: str, num_results: int = 5, search_type: str = "auto"
) -> Dict[str, Any]:
    """
    Search the web using Exa (LLM-optimized search).

    Args:
        query: Search query
        num_results: Number of results (max 20)
        search_type: Search type - 'auto', 'news', or 'deep'

    Returns:
        Dict with search results
    """
    try:
        if not EXA_API_KEY:
            return {
                "success": False,
                "error": (
                    "EXA_API_KEY not configured. "
                    "Please set EXA_API_KEY in environment variables."
                ),
            }

        exa = Exa(api_key=EXA_API_KEY)

        num_results = min(num_results, 20)

        if search_type == "news":
            results = exa.search_and_contents(
                query,
                num_results=num_results,
                type="news",
                text=True,
            )
        elif search_type == "deep":
            results = exa.search_and_contents(
                query,
                num_results=num_results,
                type="deep",
                text=True,
            )
        else:
            results = exa.search_and_contents(
                query,
                num_results=num_results,
                text=True,
            )

        formatted_results = []
        for result in results.results:
            formatted_results.append(
                {
                    "title": result.title,
                    "url": result.url,
                    "snippet": result.text[:500] if result.text else "",
                    "published_date": result.published_date,
                    "author": result.author,
                }
            )

        return {
            "success": True,
            "query": query,
            "results": formatted_results,
            "count": len(formatted_results),
            "search_type": search_type,
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


def web_search_with_contents_func(
    query: str, num_results: int = 5, contents: bool = True
) -> Dict[str, Any]:
    """
    Search the web and retrieve full content from each result.
    Best for when you need detailed information from multiple sources.

    Args:
        query: Search query
        num_results: Number of results (max 10 for content retrieval)
        contents: Whether to fetch full content

    Returns:
        Dict with search results including full content
    """
    try:
        if not EXA_API_KEY:
            return {
                "success": False,
                "error": (
                    "EXA_API_KEY not configured. "
                    "Please set EXA_API_KEY in environment variables."
                ),
            }

        exa = Exa(api_key=EXA_API_KEY)

        num_results = min(num_results, 10)

        results = exa.search_and_contents(
            query,
            num_results=num_results,
            text=True,
            contents=contents,
            highlights=True,
            highlight_count=3,
        )

        formatted_results = []
        for result in results.results:
            formatted_results.append(
                {
                    "title": result.title,
                    "url": result.url,
                    "snippet": result.text[:1000] if result.text else "",
                    "highlights": result.highlights if result.highlights else [],
                    "published_date": result.published_date,
                    "author": result.author,
                }
            )

        return {
            "success": True,
            "query": query,
            "results": formatted_results,
            "count": len(formatted_results),
            "type": "search_with_contents",
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


def find_similar_pages_func(url: str, num_results: int = 5) -> Dict[str, Any]:
    """
    Find pages similar to a given URL using Exa.

    Args:
        url: The URL to find similar pages for
        num_results: Number of similar pages to return

    Returns:
        Dict with similar pages
    """
    try:
        if not EXA_API_KEY:
            return {
                "success": False,
                "error": (
                    "EXA_API_KEY not configured. "
                    "Please set EXA_API_KEY in environment variables."
                ),
            }

        exa = Exa(api_key=EXA_API_KEY)

        num_results = min(num_results, 10)

        results = exa.find_similar(url, num_results=num_results)

        formatted_results = []
        for result in results.results:
            formatted_results.append(
                {
                    "title": result.title,
                    "url": result.url,
                    "snippet": result.text[:500] if result.text else "",
                    "score": result.score,
                }
            )

        return {
            "success": True,
            "source_url": url,
            "results": formatted_results,
            "count": len(formatted_results),
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


def get_web_search_tool() -> StructuredTool:
    """Get web search tool"""
    return StructuredTool.from_function(
        func=web_search_func,
        name="web_search",
        description=(
            "Search the web using Exa (LLM-optimized search). "
            "Returns title, URL, and snippet for each result. "
            "Use 'auto' for general queries, 'news' for recent news, "
            "'deep' for comprehensive results."
        ),
        args_schema=WebSearchInput,
    )


def get_web_search_with_contents_tool() -> StructuredTool:
    """Get web search tool with full content retrieval"""
    return StructuredTool.from_function(
        func=web_search_with_contents_func,
        name="web_search_with_contents",
        description=(
            "Search the web and retrieve full content from each result. "
            "Best for when you need detailed information from multiple sources. "
            "Returns title, URL, full content, and highlighted passages."
        ),
        args_schema=WebSearchWithContentsInput,
    )


def get_find_similar_pages_tool() -> StructuredTool:
    """Get tool to find similar pages"""
    return StructuredTool.from_function(
        func=find_similar_pages_func,
        name="find_similar_pages",
        description=(
            "Find web pages similar to a given URL. "
            "Useful for finding related content or alternative sources."
        ),
    )


def get_web_tools() -> List[StructuredTool]:
    """Get all web search tools"""
    return [
        get_web_search_tool(),
        get_web_search_with_contents_tool(),
        get_find_similar_pages_tool(),
    ]
