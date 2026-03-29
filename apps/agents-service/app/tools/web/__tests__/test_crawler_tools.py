"""
Tests for web crawler tools using crawl4ai.
"""

from unittest.mock import AsyncMock, patch

from app.tools.web.crawler_tools import (
    crawl_url_func,
    crawl_urls_func,
    get_crawl_url_tool,
    get_crawl_urls_tool,
    get_crawler_tools,
)


class MockCrawlResult:
    """Mock crawl4ai CrawlResult"""

    def __init__(
        self,
        url,
        success=True,
        error_message=None,
        markdown=None,
        cleaned_html=None,
        metadata=None,
        links=None,
    ):
        self.url = url
        self.success = success
        self.error_message = error_message
        self.markdown = markdown
        self.cleaned_html = cleaned_html
        self.metadata = metadata or {}
        self.links = links or {"internal": [], "external": []}


class TestCrawlUrl:
    """Tests for single URL crawl functionality"""

    @patch("crawl4ai.AsyncWebCrawler")
    def test_crawl_url_returns_content_successfully(self, mock_crawler_class):
        """Test that crawl_url returns content successfully"""
        mock_crawler = AsyncMock()
        mock_result = MockCrawlResult(
            url="https://example.com",
            success=True,
            markdown="# Test Page\n\nThis is the content of the page.",
            metadata={"title": "Test Page", "description": "A test page"},
            links={
                "internal": [{"text": "Link 1", "href": "/page1"}],
                "external": [{"text": "Google", "href": "https://google.com"}],
            },
        )
        mock_crawler.arun = AsyncMock(return_value=mock_result)

        mock_crawler_class.return_value.__aenter__ = AsyncMock(
            return_value=mock_crawler
        )
        mock_crawler_class.return_value.__aexit__ = AsyncMock(return_value=None)

        result = crawl_url_func("https://example.com")

        assert result["success"] is True
        assert result["url"] == "https://example.com"
        assert "Test Page" in result["content"]
        assert result["title"] == "Test Page"
        assert len(result["links"]) > 0

    @patch("crawl4ai.AsyncWebCrawler")
    def test_crawl_url_handles_failure(self, mock_crawler_class):
        """Test that crawl_url handles crawl failures"""
        mock_crawler = AsyncMock()
        mock_result = MockCrawlResult(
            url="https://example.com",
            success=False,
            error_message="Connection timeout",
        )
        mock_crawler.arun = AsyncMock(return_value=mock_result)

        mock_crawler_class.return_value.__aenter__ = AsyncMock(
            return_value=mock_crawler
        )
        mock_crawler_class.return_value.__aexit__ = AsyncMock(return_value=None)

        result = crawl_url_func("https://example.com")

        assert result["success"] is False
        assert "Connection timeout" in result["error"]

    @patch("crawl4ai.AsyncWebCrawler")
    def test_crawl_url_with_css_selector(self, mock_crawler_class):
        """Test that crawl_url respects css_selector parameter"""
        mock_crawler = AsyncMock()
        mock_result = MockCrawlResult(
            url="https://example.com",
            success=True,
            markdown="<article>Article content</article>",
        )
        mock_crawler.arun = AsyncMock(return_value=mock_result)

        mock_crawler_class.return_value.__aenter__ = AsyncMock(
            return_value=mock_crawler
        )
        mock_crawler_class.return_value.__aexit__ = AsyncMock(return_value=None)

        result = crawl_url_func("https://example.com", css_selector="article")

        assert result["success"] is True
        mock_crawler.arun.assert_called_once()
        call_kwargs = mock_crawler.arun.call_args[1]
        assert call_kwargs["config"].css_selector == "article"

    @patch("crawl4ai.AsyncWebCrawler")
    def test_crawl_url_with_word_count_threshold(self, mock_crawler_class):
        """Test that crawl_url respects word_count_threshold"""
        mock_crawler = AsyncMock()
        mock_result = MockCrawlResult(
            url="https://example.com",
            success=True,
            markdown="Short content",
        )
        mock_crawler.arun = AsyncMock(return_value=mock_result)

        mock_crawler_class.return_value.__aenter__ = AsyncMock(
            return_value=mock_crawler
        )
        mock_crawler_class.return_value.__aexit__ = AsyncMock(return_value=None)

        result = crawl_url_func("https://example.com", word_count_threshold=500)

        assert result["success"] is True
        mock_crawler.arun.assert_called_once()
        call_kwargs = mock_crawler.arun.call_args[1]
        assert call_kwargs["config"].word_count_threshold == 500


class TestCrawlUrls:
    """Tests for multiple URLs crawl functionality"""

    @patch("crawl4ai.AsyncWebCrawler")
    def test_crawl_urls_returns_multiple_results(self, mock_crawler_class):
        """Test that crawl_urls returns results for multiple URLs"""
        mock_crawler = AsyncMock()
        mock_results = [
            MockCrawlResult(
                url="https://example.com/page1",
                success=True,
                markdown="# Page 1\n\nContent of page 1",
            ),
            MockCrawlResult(
                url="https://example.com/page2",
                success=True,
                markdown="# Page 2\n\nContent of page 2",
            ),
        ]
        mock_crawler.arun_many = AsyncMock(return_value=mock_results)

        mock_crawler_class.return_value.__aenter__ = AsyncMock(
            return_value=mock_crawler
        )
        mock_crawler_class.return_value.__aexit__ = AsyncMock(return_value=None)

        result = crawl_urls_func(
            ["https://example.com/page1", "https://example.com/page2"]
        )

        assert result["success"] is True
        assert result["total_urls"] == 2
        assert result["successful"] == 2
        assert result["failed"] == 0
        assert len(result["results"]) == 2

    @patch("crawl4ai.AsyncWebCrawler")
    def test_crawl_urls_handles_mixed_results(self, mock_crawler_class):
        """Test that crawl_urls handles mix of successful and failed crawls"""
        mock_crawler = AsyncMock()
        mock_results = [
            MockCrawlResult(
                url="https://example.com/page1",
                success=True,
                markdown="# Page 1",
            ),
            MockCrawlResult(
                url="https://example.com/page2",
                success=False,
                error_message="Not found",
            ),
        ]
        mock_crawler.arun_many = AsyncMock(return_value=mock_results)

        mock_crawler_class.return_value.__aenter__ = AsyncMock(
            return_value=mock_crawler
        )
        mock_crawler_class.return_value.__aexit__ = AsyncMock(return_value=None)

        result = crawl_urls_func(
            ["https://example.com/page1", "https://example.com/page2"]
        )

        assert result["success"] is True
        assert result["successful"] == 1
        assert result["failed"] == 1
        assert result["results"][0]["success"] is True
        assert result["results"][1]["success"] is False

    def test_crawl_urls_rejects_too_many_urls(self):
        """Test that crawl_urls rejects more than 10 URLs"""
        urls = [f"https://example.com/page{i}" for i in range(15)]

        result = crawl_urls_func(urls)

        assert result["success"] is False
        assert "Maximum 10 URLs" in result["error"]


class TestCrawlerToolCreation:
    """Tests for crawler tool creation functions"""

    def test_get_crawl_url_tool_creates_valid_tool(self):
        """Test that get_crawl_url_tool creates a valid StructuredTool"""
        tool = get_crawl_url_tool()

        assert tool.name == "crawl_url"
        assert tool.description is not None
        assert "url" in tool.args_schema.model_fields

    def test_get_crawl_urls_tool_creates_valid_tool(self):
        """Test that get_crawl_urls_tool creates a valid tool"""
        tool = get_crawl_urls_tool()

        assert tool.name == "crawl_urls"
        assert tool.description is not None
        assert "urls" in tool.args_schema.model_fields

    def test_get_crawler_tools_returns_all_tools(self):
        """Test that get_crawler_tools returns all crawler tools"""
        tools = get_crawler_tools()

        assert len(tools) == 2
        tool_names = [t.name for t in tools]
        assert "crawl_url" in tool_names
        assert "crawl_urls" in tool_names


class TestCrawlerEdgeCases:
    """Tests for edge cases in crawler tools"""

    @patch("crawl4ai.AsyncWebCrawler")
    def test_crawl_url_handles_exception(self, mock_crawler_class):
        """Test that crawl_url handles exceptions gracefully"""
        mock_crawler_class.return_value.__aenter__ = AsyncMock(
            side_effect=Exception("Browser error")
        )

        result = crawl_url_func("https://example.com")

        assert result["success"] is False
        assert "error" in result

    @patch("crawl4ai.AsyncWebCrawler")
    def test_crawl_url_uses_markdown_preference(self, mock_crawler_class):
        """Test that crawl_url prefers markdown over cleaned_html"""
        mock_crawler = AsyncMock()
        mock_result = MockCrawlResult(
            url="https://example.com",
            success=True,
            markdown="# Markdown Content",
            cleaned_html="<h1>HTML Content</h1>",
        )
        mock_crawler.arun = AsyncMock(return_value=mock_result)

        mock_crawler_class.return_value.__aenter__ = AsyncMock(
            return_value=mock_crawler
        )
        mock_crawler_class.return_value.__aexit__ = AsyncMock(return_value=None)

        result = crawl_url_func("https://example.com")

        assert "Markdown Content" in result["content"]
