"""
Web Crawler Tools
LangChain tools for web crawling using crawl4ai.
"""

import asyncio
from typing import Any, Dict, List, Optional

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field


class CrawlUrlInput(BaseModel):
    """Input for crawling a URL"""

    url: str = Field(..., description="The URL to crawl")
    word_count_threshold: int = Field(
        200,
        description=(
            "Minimum word count for content to be returned "
            "(filters out low-content pages)"
        ),
    )
    css_selector: Optional[str] = Field(
        None,
        description=(
            "CSS selector to extract specific content (e.g., 'article', '.content')"
        ),
    )


class CrawlUrlsInput(BaseModel):
    """Input for crawling multiple URLs"""

    urls: List[str] = Field(..., description="List of URLs to crawl (max 10 URLs)")
    word_count_threshold: int = Field(
        200,
        description="Minimum word count for content to be returned",
    )


async def _crawl_url_async(
    url: str, word_count_threshold: int = 200, css_selector: Optional[str] = None
) -> Dict[str, Any]:
    """
    Crawl a single URL using crawl4ai asynchronously.

    Args:
        url: URL to crawl
        word_count_threshold: Minimum word count
        css_selector: Optional CSS selector for specific content

    Returns:
        Dict with crawl result
    """
    try:
        browser_cfg = BrowserConfig(
            browser_type="chromium",
            headless=True,
            verbose=False,
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
        )

        run_cfg = CrawlerRunConfig(
            word_count_threshold=word_count_threshold,
            css_selector=css_selector,
            remove_overlay_elements=True,
            page_timeout=30000,
        )

        async with AsyncWebCrawler(config=browser_cfg) as crawler:
            result = await crawler.arun(url=url, config=run_cfg)

            if result.success:
                content = result.markdown if result.markdown else result.cleaned_html
                return {
                    "success": True,
                    "url": url,
                    "final_url": result.url,
                    "title": result.metadata.get("title") if result.metadata else None,
                    "description": (
                        result.metadata.get("description") if result.metadata else None
                    ),
                    "content": content[:10000] if content else "",
                    "content_length": len(content) if content else 0,
                    "links": [
                        {"text": link["text"], "href": link["href"]}
                        for link in (result.links.get("internal", [])[:10])
                        + (result.links.get("external", [])[:10])
                    ],
                }
            else:
                return {
                    "success": False,
                    "url": url,
                    "error": result.error_message or "Unknown error",
                }

    except Exception as e:
        return {"success": False, "url": url, "error": str(e)}


def crawl_url_sync(
    url: str, word_count_threshold: int = 200, css_selector: Optional[str] = None
) -> Dict[str, Any]:
    """
    Crawl a single URL (synchronous wrapper).

    Args:
        url: URL to crawl
        word_count_threshold: Minimum word count
        css_selector: Optional CSS selector

    Returns:
        Dict with crawl result
    """
    return asyncio.run(_crawl_url_async(url, word_count_threshold, css_selector))


def crawl_url_func(
    url: str, word_count_threshold: int = 200, css_selector: Optional[str] = None
) -> Dict[str, Any]:
    """
    Crawl a single URL using crawl4ai.

    Args:
        url: URL to crawl
        word_count_threshold: Minimum word count for content
        css_selector: Optional CSS selector for specific content extraction

    Returns:
        Dict with crawl result including markdown content and links
    """
    return crawl_url_sync(url, word_count_threshold, css_selector)


async def _crawl_urls_async(
    urls: List[str], word_count_threshold: int = 200
) -> Dict[str, Any]:
    """
    Crawl multiple URLs using crawl4ai asynchronously.

    Args:
        urls: List of URLs to crawl
        word_count_threshold: Minimum word count

    Returns:
        Dict with crawl results for all URLs
    """
    try:
        browser_cfg = BrowserConfig(
            browser_type="chromium",
            headless=True,
            verbose=False,
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
        )

        run_cfg = CrawlerRunConfig(
            word_count_threshold=word_count_threshold,
            remove_overlay_elements=True,
            page_timeout=30000,
        )

        async with AsyncWebCrawler(config=browser_cfg) as crawler:
            results = await crawler.arun_many(urls=urls, config=run_cfg)

            formatted_results = []
            for result in results:
                if result.success:
                    content = (
                        result.markdown if result.markdown else result.cleaned_html
                    )
                    formatted_results.append(
                        {
                            "success": True,
                            "url": result.url,
                            "final_url": result.url,
                            "title": (
                                result.metadata.get("title")
                                if result.metadata
                                else None
                            ),
                            "content": content[:5000] if content else "",
                            "content_length": len(content) if content else 0,
                        }
                    )
                else:
                    formatted_results.append(
                        {
                            "success": False,
                            "url": result.url,
                            "error": result.error_message or "Unknown error",
                        }
                    )

            return {
                "success": True,
                "results": formatted_results,
                "total_urls": len(urls),
                "successful": sum(1 for r in formatted_results if r.get("success")),
                "failed": sum(1 for r in formatted_results if not r.get("success")),
            }

    except Exception as e:
        return {"success": False, "error": str(e)}


def crawl_urls_func(urls: List[str], word_count_threshold: int = 200) -> Dict[str, Any]:
    """
    Crawl multiple URLs using crawl4ai.

    Args:
        urls: List of URLs to crawl (max 10)
        word_count_threshold: Minimum word count for content

    Returns:
        Dict with crawl results for all URLs
    """
    if len(urls) > 10:
        return {
            "success": False,
            "error": "Maximum 10 URLs allowed per crawl",
        }

    return asyncio.run(_crawl_urls_async(urls, word_count_threshold))


def get_crawl_url_tool() -> StructuredTool:
    """Get single URL crawl tool"""
    return StructuredTool.from_function(
        func=crawl_url_func,
        name="crawl_url",
        description=(
            "Crawl a single web page using crawl4ai. "
            "Returns the page content in markdown format along with metadata "
            "and links. Use word_count_threshold to filter out low-content pages. "
            "Use css_selector to extract specific content (e.g., 'article', '.content')"
            "."
        ),
        args_schema=CrawlUrlInput,
    )


def get_crawl_urls_tool() -> StructuredTool:
    """Get multiple URLs crawl tool"""
    return StructuredTool.from_function(
        func=crawl_urls_func,
        name="crawl_urls",
        description=(
            "Crawl multiple web pages (up to 10 URLs) using crawl4ai. "
            "Returns content for each URL. Use for batch crawling multiple sources."
        ),
        args_schema=CrawlUrlsInput,
    )


def get_crawler_tools() -> List[StructuredTool]:
    """Get all crawler tools"""
    return [get_crawl_url_tool(), get_crawl_urls_tool()]
