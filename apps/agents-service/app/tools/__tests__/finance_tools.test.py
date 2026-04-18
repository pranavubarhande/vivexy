from unittest.mock import patch

import pytest

from app.tools.stocks.yahoo_finance_tools import (
    get_stock_quote_tool,
    get_yahoo_finance_quote_tool,
)


def test_get_stock_quote_tool():
    tool = get_stock_quote_tool()
    assert tool.name == "get_stock_quote"
    assert tool.description is not None
    assert tool.args_schema is not None


def test_get_yahoo_finance_quote_tool():
    tool = get_yahoo_finance_quote_tool()
    assert tool.name == "get_yahoo_finance_quote"
    assert tool.description is not None
    assert tool.args_schema is not None
