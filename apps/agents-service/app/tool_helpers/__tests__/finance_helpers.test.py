from unittest.mock import patch

import pytest

from app.tool_helpers.finance.cache_helpers import delete_cache, get_cache, set_cache
from app.tool_helpers.finance.yahoo_finance_helpers import get_stock_quote


class _FakeRedis:
    """In-memory stand-in for the module-level redis_client — cache_helpers
    talks to a real Redis server otherwise, which this test suite should not
    require."""

    def __init__(self):
        self._store = {}

    def get(self, key):
        return self._store.get(key)

    def setex(self, key, ttl_seconds, value):
        self._store[key] = value

    def delete(self, key):
        self._store.pop(key, None)


def test_cache_helpers():
    with patch("app.tool_helpers.finance.cache_helpers.redis_client", _FakeRedis()):
        set_cache("test_key", "test_value")
        assert get_cache("test_key") == "test_value"

        delete_cache("test_key")
        assert get_cache("test_key") is None


@patch("app.tool_helpers.finance.yahoo_finance_helpers.yf.Ticker")
def test_get_stock_quote(mock_ticker):
    mock_ticker_instance = mock_ticker.return_value
    mock_history = mock_ticker_instance.history

    from io import StringIO

    import pandas as pd

    mock_csv = (
        "Date,Open,High,Low,Close,Volume\n2026-01-01,100.0,110.0,90.0,105.0,1000\n"
    )
    df = pd.read_csv(StringIO(mock_csv), parse_dates=["Date"])
    # Convert scalar types to native python objects using object dtype
    df = df.astype(object)
    df.set_index("Date", inplace=True)

    mock_history.return_value = df

    # Clear cache so we actually invoke the _fetch function
    delete_cache("stock_quote:AAPL:1d:1")
    result = get_stock_quote("AAPL", interval="1d", days=1)

    assert result["stock"] == "AAPL"
    assert len(result["data"]) > 0
    assert result["data"][0]["close"] == 105.0
    mock_ticker.assert_called_with("AAPL")
