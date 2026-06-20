"""
Market data tools — FX rates, broader market indices, commodity prices.
Extends the existing yahoo_finance_tools with cross-asset coverage.
Uses yfinance (already a dependency) and the free ECB FX API.
"""

import json
from typing import List

import httpx
from langchain_core.tools import BaseTool, tool


@tool
def get_fx_rate(base: str, quote: str) -> str:
    """Get the current exchange rate between two currencies.
    Args:
        base: Base currency code (e.g. USD, EUR, GBP)
        quote: Quote currency code (e.g. JPY, CHF, AUD)
    """
    try:
        import yfinance as yf

        ticker = yf.Ticker(f"{base}{quote}=X")
        hist = ticker.history(period="1d")
        if hist.empty:
            return json.dumps({"error": f"No data for {base}/{quote}"})
        rate = float(hist["Close"].iloc[-1])
        return json.dumps({"base": base, "quote": quote, "rate": rate})
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_index_quote(index_symbol: str) -> str:
    """Get the current value and daily change for a market index.
    Args:
        index_symbol: Yahoo Finance index symbol (e.g. ^GSPC for S&P 500, ^FTSE, ^N225)
    """
    try:
        import yfinance as yf

        ticker = yf.Ticker(index_symbol)
        info = ticker.fast_info
        return json.dumps(
            {
                "symbol": index_symbol,
                "last_price": getattr(info, "last_price", None),
                "previous_close": getattr(info, "previous_close", None),
                "currency": getattr(info, "currency", None),
            }
        )
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_ecb_fx_rates(base: str = "EUR") -> str:
    """Get latest FX rates from the European Central Bank (free, no API key).
    Args:
        base: Base currency (default EUR — ECB only publishes EUR-based rates)
    """
    try:
        resp = httpx.get(
            "https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A",
            params={"lastNObservations": 1, "format": "jsondata"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        series = data.get("dataSets", [{}])[0].get("series", {})
        structure = data.get("structure", {}).get("dimensions", {}).get("series", [])
        currency_dim = next((d for d in structure if d.get("id") == "CURRENCY"), None)
        currencies = [v.get("id") for v in (currency_dim or {}).get("values", [])]
        rates = {}
        for i, currency in enumerate(currencies):
            obs = series.get(f"0:{i}:0:0:0", {}).get("observations", {})
            if obs:
                last_val = list(obs.values())[-1]
                if last_val and last_val[0] is not None:
                    rates[currency] = last_val[0]
        return json.dumps({"base": "EUR", "rates": rates})
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_commodity_price(commodity: str) -> str:
    """Get the current price for a commodity via Yahoo Finance.
    Args:
        commodity: Yahoo Finance commodity ticker (e.g. GC=F for Gold, CL=F for Crude Oil, SI=F for Silver)
    """
    try:
        import yfinance as yf

        ticker = yf.Ticker(commodity)
        hist = ticker.history(period="5d")
        if hist.empty:
            return json.dumps({"error": f"No data for {commodity}"})
        latest = hist.tail(1).iloc[0]
        return json.dumps(
            {
                "symbol": commodity,
                "close": float(latest["Close"]),
                "open": float(latest["Open"]),
                "high": float(latest["High"]),
                "low": float(latest["Low"]),
                "volume": int(latest["Volume"]),
            }
        )
    except Exception as e:
        return json.dumps({"error": str(e)})


def get_market_data_tools() -> List[BaseTool]:
    return [get_fx_rate, get_index_quote, get_ecb_fx_rates, get_commodity_price]
