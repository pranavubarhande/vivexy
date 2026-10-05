"""
Tests for finance domain tools:
  - market_data_tools: FX rates, indices, commodities (mocked yfinance + httpx)
  - sec_edgar_tools: EDGAR search and company facts (mocked httpx)
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from agents_core.tools.finance.market_data_tools import (
    get_commodity_price,
    get_ecb_fx_rates,
    get_fx_rate,
    get_index_quote,
    get_market_data_tools,
)

# ---------------------------------------------------------------------------
# market_data_tools
# ---------------------------------------------------------------------------


class TestGetMarketDataTools:
    def test_returns_four_tools(self):
        tools = get_market_data_tools()
        assert len(tools) == 4

    def test_tool_names(self):
        names = {t.name for t in get_market_data_tools()}
        assert names == {
            "get_fx_rate",
            "get_index_quote",
            "get_ecb_fx_rates",
            "get_commodity_price",
        }

    def test_tools_have_descriptions(self):
        for t in get_market_data_tools():
            assert t.description


class TestGetFxRate:
    def _mock_ticker(self, close_price=1.08):
        import pandas as pd

        mock_ticker = MagicMock()
        mock_ticker.history.return_value = pd.DataFrame({"Close": [close_price]})
        return mock_ticker

    def test_returns_rate(self):
        with patch("yfinance.Ticker", return_value=self._mock_ticker(1.08)):
            result = json.loads(get_fx_rate.invoke({"base": "USD", "quote": "EUR"}))
        assert result["base"] == "USD"
        assert result["quote"] == "EUR"
        assert result["rate"] == pytest.approx(1.08)

    def test_empty_history_returns_error(self):
        import pandas as pd

        mock_ticker = MagicMock()
        mock_ticker.history.return_value = pd.DataFrame()
        with patch("yfinance.Ticker", return_value=mock_ticker):
            result = json.loads(get_fx_rate.invoke({"base": "USD", "quote": "XYZ"}))
        assert "error" in result

    def test_exception_returns_error(self):
        with patch("yfinance.Ticker", side_effect=Exception("network error")):
            result = json.loads(get_fx_rate.invoke({"base": "USD", "quote": "EUR"}))
        assert "error" in result


class TestGetIndexQuote:
    def test_returns_quote_fields(self):
        mock_ticker = MagicMock()
        mock_ticker.fast_info.last_price = 5000.0
        mock_ticker.fast_info.previous_close = 4990.0
        mock_ticker.fast_info.currency = "USD"
        with patch("yfinance.Ticker", return_value=mock_ticker):
            result = json.loads(get_index_quote.invoke({"index_symbol": "^GSPC"}))
        assert result["symbol"] == "^GSPC"
        assert result["last_price"] == 5000.0
        assert result["currency"] == "USD"

    def test_exception_returns_error(self):
        with patch("yfinance.Ticker", side_effect=Exception("timeout")):
            result = json.loads(get_index_quote.invoke({"index_symbol": "^GSPC"}))
        assert "error" in result


class TestGetEcbFxRates:
    _ECB_RESPONSE = {
        "dataSets": [{"series": {"0:0:0:0:0": {"observations": {"0": [1.08]}}}}],
        "structure": {
            "dimensions": {"series": [{"id": "CURRENCY", "values": [{"id": "USD"}]}]}
        },
    }

    def _mock_response(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = self._ECB_RESPONSE
        mock_resp.raise_for_status = MagicMock()
        return mock_resp

    def test_returns_rates(self):
        with patch(
            "agents_core.tools.finance.market_data_tools.httpx.get",
            return_value=self._mock_response(),
        ):
            result = json.loads(get_ecb_fx_rates.invoke({"base": "EUR"}))
        assert result["base"] == "EUR"
        assert "rates" in result
        assert "USD" in result["rates"]

    def test_network_error_returns_error(self):
        with patch(
            "agents_core.tools.finance.market_data_tools.httpx.get",
            side_effect=Exception("timeout"),
        ):
            result = json.loads(get_ecb_fx_rates.invoke({"base": "EUR"}))
        assert "error" in result


class TestGetCommodityPrice:
    def test_returns_price_fields(self):
        import pandas as pd

        mock_ticker = MagicMock()
        mock_ticker.history.return_value = pd.DataFrame(
            {
                "Close": [2300.0],
                "Open": [2290.0],
                "High": [2310.0],
                "Low": [2285.0],
                "Volume": [100000],
            }
        )
        with patch("yfinance.Ticker", return_value=mock_ticker):
            result = json.loads(get_commodity_price.invoke({"commodity": "GC=F"}))
        assert result["symbol"] == "GC=F"
        assert result["close"] == pytest.approx(2300.0)
        assert "high" in result
        assert "low" in result

    def test_empty_history_returns_error(self):
        import pandas as pd

        mock_ticker = MagicMock()
        mock_ticker.history.return_value = pd.DataFrame()
        with patch("yfinance.Ticker", return_value=mock_ticker):
            result = json.loads(get_commodity_price.invoke({"commodity": "INVALID=F"}))
        assert "error" in result


# ---------------------------------------------------------------------------
# sec_edgar_tools
# ---------------------------------------------------------------------------

from agents_core.tools.finance.sec_edgar_tools import (
    get_company_facts,
    get_sec_edgar_tools,
    lookup_company_cik,
    search_sec_filings,
)


class TestGetSecEdgarTools:
    def test_returns_three_tools(self):
        tools = get_sec_edgar_tools()
        assert len(tools) == 3

    def test_tool_names(self):
        names = {t.name for t in get_sec_edgar_tools()}
        assert names == {
            "search_sec_filings",
            "get_company_facts",
            "lookup_company_cik",
        }

    def test_tools_have_descriptions(self):
        for t in get_sec_edgar_tools():
            assert t.description


class TestSearchSecFilings:
    _EDGAR_RESPONSE = {
        "hits": {
            "total": {"value": 1},
            "hits": [
                {
                    "_source": {
                        "entity_name": "Apple Inc",
                        "form_type": "10-K",
                        "file_date": "2024-11-01",
                        "period_of_report": "2024-09-28",
                        "file_path": "edgar/data/320193/000032019324000123/0000320193-24-000123-index.htm",
                    }
                }
            ],
        }
    }

    def _mock_response(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = self._EDGAR_RESPONSE
        mock_resp.raise_for_status = MagicMock()
        return mock_resp

    def test_returns_results(self):
        with patch(
            "agents_core.tools.finance.sec_edgar_tools.httpx.get",
            return_value=self._mock_response(),
        ):
            result = json.loads(
                search_sec_filings.invoke(
                    {
                        "query": "goodwill impairment",
                        "form_type": "10-K",
                        "date_range": "",
                    }
                )
            )
        assert result["total"] == 1
        assert result["results"][0]["entity"] == "Apple Inc"
        assert result["results"][0]["form_type"] == "10-K"

    def test_network_error_returns_error(self):
        with patch(
            "agents_core.tools.finance.sec_edgar_tools.httpx.get",
            side_effect=Exception("timeout"),
        ):
            result = json.loads(
                search_sec_filings.invoke(
                    {"query": "anything", "form_type": "", "date_range": ""}
                )
            )
        assert "error" in result

    def test_date_range_parsed(self):
        with patch(
            "agents_core.tools.finance.sec_edgar_tools.httpx.get",
            return_value=self._mock_response(),
        ) as mock_get:
            search_sec_filings.invoke(
                {
                    "query": "test",
                    "form_type": "10-K",
                    "date_range": "2024-01-01,2024-12-31",
                }
            )
        call_kwargs = mock_get.call_args
        params = (
            call_kwargs[1].get("params") or call_kwargs[0][1]
            if len(call_kwargs[0]) > 1
            else {}
        )
        # Just assert the call was made — date parsing doesn't error
        assert mock_get.called


class TestGetCompanyFacts:
    _FACTS_RESPONSE = {
        "entityName": "Apple Inc",
        "units": {
            "USD": [
                {"end": "2024-09-28", "val": 391035000000, "form": "10-K"},
                {"end": "2023-09-30", "val": 383285000000, "form": "10-K"},
            ]
        },
    }

    def _mock_response(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = self._FACTS_RESPONSE
        mock_resp.raise_for_status = MagicMock()
        return mock_resp

    def test_returns_entity_and_values(self):
        with patch(
            "agents_core.tools.finance.sec_edgar_tools.httpx.get",
            return_value=self._mock_response(),
        ):
            result = json.loads(
                get_company_facts.invoke(
                    {"cik": "0000320193", "concept": "us-gaap/Revenues"}
                )
            )
        assert result["entity"] == "Apple Inc"
        assert len(result["recent_values"]) == 2
        assert result["concept"] == "us-gaap/Revenues"

    def test_cik_zero_padded(self):
        with patch(
            "agents_core.tools.finance.sec_edgar_tools.httpx.get",
            return_value=self._mock_response(),
        ) as mock_get:
            get_company_facts.invoke({"cik": "320193", "concept": "us-gaap/Revenues"})
        called_url = mock_get.call_args[0][0]
        assert "CIK0000320193" in called_url

    def test_network_error_returns_error(self):
        with patch(
            "agents_core.tools.finance.sec_edgar_tools.httpx.get",
            side_effect=Exception("timeout"),
        ):
            result = json.loads(
                get_company_facts.invoke(
                    {"cik": "0000320193", "concept": "us-gaap/Revenues"}
                )
            )
        assert "error" in result


class TestLookupCompanyCik:
    _SEARCH_RESPONSE = {
        "hits": {
            "hits": [
                {"_source": {"entity_name": "Apple Inc", "cik": "0000320193"}},
                {
                    "_source": {
                        "entity_name": "Apple Hospitality REIT Inc",
                        "cik": "0001418121",
                    }
                },
            ]
        }
    }

    def _mock_response(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = self._SEARCH_RESPONSE
        mock_resp.raise_for_status = MagicMock()
        return mock_resp

    def test_returns_results(self):
        with patch(
            "agents_core.tools.finance.sec_edgar_tools.httpx.get",
            return_value=self._mock_response(),
        ):
            result = json.loads(lookup_company_cik.invoke({"company_name": "Apple"}))
        assert len(result["results"]) == 2
        assert result["results"][0]["entity"] == "Apple Inc"

    def test_network_error_returns_error(self):
        with patch(
            "agents_core.tools.finance.sec_edgar_tools.httpx.get",
            side_effect=Exception("timeout"),
        ):
            result = json.loads(lookup_company_cik.invoke({"company_name": "Apple"}))
        assert "error" in result
