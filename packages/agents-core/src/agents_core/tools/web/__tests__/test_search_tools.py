"""
Tests for web search tools using Exa.
"""

from unittest.mock import MagicMock, patch

import pytest

from agents_core.tools.web.search_tools import (
    find_similar_pages_func,
    get_find_similar_pages_tool,
    get_web_search_tool,
    get_web_search_with_contents_tool,
    get_web_tools,
    web_search_func,
    web_search_with_contents_func,
)


class MockExaResult:
    """Mock Exa search result"""

    def __init__(
        self,
        title,
        url,
        text=None,
        published_date=None,
        author=None,
        highlights=None,
        score=None,
    ):
        self.title = title
        self.url = url
        self.text = text
        self.published_date = published_date
        self.author = author
        self.highlights = highlights or []
        self.score = score


class MockExaResults:
    """Mock Exa search results container"""

    def __init__(self, results):
        self.results = results


@pytest.fixture
def mock_exa_results():
    """Mock Exa search results"""
    return MockExaResults(
        [
            MockExaResult(
                title="Python Programming",
                url="https://example.com/python",
                text="Learn Python programming language",
                published_date="2024-01-15",
                author="John Doe",
            ),
            MockExaResult(
                title="JavaScript Tutorial",
                url="https://example.com/javascript",
                text="JavaScript for beginners",
                published_date="2024-01-20",
                author="Jane Smith",
            ),
        ]
    )


class TestWebSearch:
    """Tests for web search functionality"""

    @patch("exa_py.Exa")
    @patch("agents_core.tools.web.search_tools.Config")
    def test_web_search_returns_results_successfully(
        self, mock_config_class, mock_exa_class
    ):
        """Test web search returns results successfully"""
        mock_config_class.EXA_API_KEY = "test_api_key"

        mock_results = MockExaResults(
            [
                MockExaResult(
                    title="Python Programming",
                    url="https://example.com/python",
                    text="Learn Python programming language",
                    published_date="2024-01-15",
                    author="John Doe",
                ),
                MockExaResult(
                    title="JavaScript Tutorial",
                    url="https://example.com/javascript",
                    text="JavaScript for beginners",
                    published_date="2024-01-20",
                    author="Jane Smith",
                ),
            ]
        )

        mock_exa = MagicMock()
        mock_exa.search_and_contents.return_value = mock_results
        mock_exa_class.return_value = mock_exa

        result = web_search_func("python programming", num_results=5)

        assert result["success"] is True
        assert result["query"] == "python programming"
        assert result["count"] == 2
        assert len(result["results"]) == 2
        assert result["results"][0]["title"] == "Python Programming"
        assert result["results"][0]["url"] == "https://example.com/python"

    @patch("exa_py.Exa")
    @patch("agents_core.tools.web.search_tools.Config")
    def test_web_search_limits_results_to_max(self, mock_config_class, mock_exa_class):
        """Test that web search limits results to max allowed (20)"""
        mock_config_class.EXA_API_KEY = "test_api_key"

        mock_exa = MagicMock()
        mock_exa.search_and_contents.return_value = MockExaResults([])
        mock_exa_class.return_value = mock_exa

        web_search_func("test", num_results=30)

        mock_exa.search_and_contents.assert_called_once()
        call_args = mock_exa.search_and_contents.call_args
        assert call_args[1]["num_results"] == 20

    @patch("exa_py.Exa")
    @patch("agents_core.tools.web.search_tools.Config")
    def test_web_search_with_news_type(self, mock_config_class, mock_exa_class):
        """Test web search with news type"""
        mock_config_class.EXA_API_KEY = "test_api_key"

        mock_exa = MagicMock()
        mock_exa.search_and_contents.return_value = MockExaResults([])
        mock_exa_class.return_value = mock_exa

        result = web_search_func("tech news", search_type="news")

        assert result["success"] is True
        call_args = mock_exa.search_and_contents.call_args
        assert call_args[1]["type"] == "news"


class TestWebSearchWithContents:
    """Tests for web search with contents functionality"""

    @patch("exa_py.Exa")
    @patch("agents_core.tools.web.search_tools.Config")
    def test_web_search_with_contents_returns_highlights(
        self, mock_config_class, mock_exa_class
    ):
        """Test that search with contents returns highlights"""
        mock_config_class.EXA_API_KEY = "test_api_key"

        mock_results = MockExaResults(
            [
                MockExaResult(
                    title="Test Article",
                    url="https://example.com/article",
                    text="This is the full content of the article",
                    highlights=["highlight 1", "highlight 2"],
                )
            ]
        )

        mock_exa = MagicMock()
        mock_exa.search_and_contents.return_value = mock_results
        mock_exa_class.return_value = mock_exa

        result = web_search_with_contents_func("test query", num_results=5)

        assert result["success"] is True
        assert result["results"][0]["highlights"] == ["highlight 1", "highlight 2"]


class TestFindSimilarPages:
    """Tests for finding similar pages functionality"""

    @patch("exa_py.Exa")
    @patch("agents_core.tools.web.search_tools.Config")
    def test_find_similar_pages_returns_results(
        self, mock_config_class, mock_exa_class
    ):
        """Test that find similar pages returns results with scores"""
        mock_config_class.EXA_API_KEY = "test_api_key"

        mock_results = MockExaResults(
            [
                MockExaResult(
                    title="Similar Page 1",
                    url="https://example.com/similar1",
                    text="Content of similar page",
                    score=0.95,
                ),
                MockExaResult(
                    title="Similar Page 2",
                    url="https://example.com/similar2",
                    text="Another similar page",
                    score=0.85,
                ),
            ]
        )

        mock_exa = MagicMock()
        mock_exa.find_similar.return_value = mock_results
        mock_exa_class.return_value = mock_exa

        result = find_similar_pages_func("https://example.com", num_results=5)

        assert result["success"] is True
        assert result["count"] == 2
        assert result["results"][0]["score"] == 0.95


class TestToolCreation:
    """Tests for tool creation functions"""

    def test_get_web_search_tool_creates_valid_tool(self):
        """Test that get_web_search_tool creates a valid StructuredTool"""
        tool = get_web_search_tool()

        assert tool.name == "web_search"
        assert tool.description is not None
        assert "query" in tool.args_schema.model_fields

    def test_get_web_search_with_contents_tool_creates_valid_tool(self):
        """Test that get_web_search_with_contents_tool creates a valid tool"""
        tool = get_web_search_with_contents_tool()

        assert tool.name == "web_search_with_contents"
        assert tool.description is not None

    def test_get_find_similar_pages_tool_creates_valid_tool(self):
        """Test that get_find_similar_pages_tool creates a valid tool"""
        tool = get_find_similar_pages_tool()

        assert tool.name == "find_similar_pages"
        assert tool.description is not None

    def test_get_web_tools_returns_all_tools(self):
        """Test that get_web_tools returns all web search tools"""
        tools = get_web_tools()

        assert len(tools) == 3
        tool_names = [t.name for t in tools]
        assert "web_search" in tool_names
        assert "web_search_with_contents" in tool_names
        assert "find_similar_pages" in tool_names
