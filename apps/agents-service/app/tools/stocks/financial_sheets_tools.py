from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from app.tool_helpers.finance.financial_sheets_helpers import get_financial_sheets

class GetFinancialSheetsInput(BaseModel):
    stock: str = Field(..., description="Stock symbol (e.g., RELIANCE, TCS)")
    subtype: str = Field(None, description="Specific sheet type: balance_sheet, profit_loss, cash_flow, quarterly_results, ratios, shareholding_pattern")

def get_financial_sheets_tool():
    """Get financial sheets tool."""
    return StructuredTool.from_function(
        func=lambda **kwargs: get_financial_sheets(**kwargs),
        name="get_financial_sheets",
        description="Get financial statements and data for Indian companies from Screener.in. Includes balance sheets, profit & loss, cash flow, quarterly results, ratios, and shareholding patterns.",
        args_schema=GetFinancialSheetsInput
    )