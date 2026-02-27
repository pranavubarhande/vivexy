from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from app.tool_helpers.finance.yahoo_finance_helpers import (
    get_stock_quote, get_yahoo_finance_quote, get_yahoo_finance_quote_summary,
    get_yahoo_finance_historical, get_yahoo_finance_search
)

class GetStockQuoteInput(BaseModel):
    stock: str = Field(..., description="Stock symbol (e.g., AAPL, RELIANCE.NS)")
    interval: str = Field("1d", description="Time interval: 1d, 1wk, 1mo")
    days: int = Field(30, description="Number of days of data (1-3650)")

class GetYahooFinanceQuoteInput(BaseModel):
    stock: str = Field(..., description="Stock symbol")

class GetYahooFinanceQuoteSummaryInput(BaseModel):
    stock: str = Field(..., description="Stock symbol")
    modules: list[str] = Field(..., description="Modules to fetch: assetProfile, summaryDetail, etc.")

class GetYahooFinanceHistoricalInput(BaseModel):
    stock: str = Field(..., description="Stock symbol")
    interval: str = Field("1d", description="Interval: 1d, 1wk, 1mo")
    days: int = Field(30, description="Number of days")

class GetYahooFinanceSearchInput(BaseModel):
    query: str = Field(..., description="Search query")
    count: int = Field(10, description="Number of results")

def get_stock_quote_tool():
    """Get stock quote tool."""
    return StructuredTool.from_function(
        func=lambda **kwargs: get_stock_quote(**kwargs),
        name="get_stock_quote",
        description="Get historical stock price data for analysis and charting.",
        args_schema=GetStockQuoteInput
    )

def get_yahoo_finance_quote_tool():
    """Get Yahoo Finance quote tool."""
    return StructuredTool.from_function(
        func=lambda **kwargs: get_yahoo_finance_quote(**kwargs),
        name="get_yahoo_finance_quote",
        description="Get basic stock quote information from Yahoo Finance.",
        args_schema=GetYahooFinanceQuoteInput
    )

def get_yahoo_finance_quote_summary_tool():
    """Get Yahoo Finance quote summary tool."""
    return StructuredTool.from_function(
        func=lambda **kwargs: get_yahoo_finance_quote_summary(**kwargs),
        name="get_yahoo_finance_quote_summary",
        description="Get detailed stock summary information including profile, financials, and statistics.",
        args_schema=GetYahooFinanceQuoteSummaryInput
    )

def get_yahoo_finance_historical_tool():
    """Get Yahoo Finance historical tool."""
    return StructuredTool.from_function(
        func=lambda **kwargs: get_yahoo_finance_historical(**kwargs),
        name="get_yahoo_finance_historical",
        description="Get historical price data from Yahoo Finance.",
        args_schema=GetYahooFinanceHistoricalInput
    )

def get_yahoo_finance_search_tool():
    """Get Yahoo Finance search tool."""
    return StructuredTool.from_function(
        func=lambda **kwargs: get_yahoo_finance_search(**kwargs),
        name="get_yahoo_finance_search",
        description="Search for stocks and financial instruments.",
        args_schema=GetYahooFinanceSearchInput
    )

# Additional tools can be added as needed...