from agents_core.tool_helpers.finance.news_helpers import get_stock_news
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field


class GetStockNewsInput(BaseModel):
    stock: str = Field(..., description="Stock symbol (e.g., AAPL, RELIANCE)")
    count: int = Field(10, description="Number of news items to fetch (max 20)")


def get_stock_news_tool():
    """Get stock news tool."""
    return StructuredTool.from_function(
        func=lambda **kwargs: get_stock_news(**kwargs),
        name="get_stock_news",
        description="Get recent news articles for a specific stock from Google News. Useful for understanding market sentiment and recent developments.",
        args_schema=GetStockNewsInput,
    )
