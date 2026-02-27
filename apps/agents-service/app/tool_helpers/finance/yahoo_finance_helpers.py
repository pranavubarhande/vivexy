from datetime import datetime, timedelta

import yfinance as yf

from .cache_helpers import cache_wrapper


def get_stock_quote(stock: str, interval: str = "1d", days: int = 30):
    """Get stock quote data."""
    cache_key = f"stock_quote:{stock}:{interval}:{days}"
    return cache_wrapper(
        cache_key, lambda: _fetch_stock_quote(stock, interval, days), 3600
    )


def _fetch_stock_quote(stock: str, interval: str, days: int):
    """Fetch stock quote data."""
    try:
        # Map intervals
        interval_map = {"1d": "1d", "1wk": "1wk", "1mo": "1mo"}

        valid_interval = interval_map.get(interval, "1d")
        if interval not in interval_map:
            print(f"Invalid interval '{interval}' provided, defaulting to '1d'")

        if not (1 <= days <= 3650):
            raise ValueError("Days must be a number between 1 and 3650")

        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

        ticker = yf.Ticker(stock)
        data = ticker.history(start=start_date, end=end_date, interval=valid_interval)

        # Convert to list of dicts
        quotes = []
        for date, row in data.iterrows():
            quotes.append(
                {
                    "date": date.isoformat(),
                    "open": row.get("Open"),
                    "high": row.get("High"),
                    "low": row.get("Low"),
                    "close": row.get("Close"),
                    "volume": row.get("Volume"),
                }
            )

        return {
            "success": True,
            "stock": stock,
            "type": "quote",
            "interval": interval,
            "days": days,
            "data": quotes,
        }

    except Exception as e:
        raise Exception(f"Error getting quote data for {stock}: {str(e)}")


def get_yahoo_finance_quote(stock: str):
    """Get basic quote info."""
    cache_key = f"yahoo_quote:{stock}"
    return cache_wrapper(cache_key, lambda: _fetch_yahoo_quote(stock), 3600)


def _fetch_yahoo_quote(stock: str):
    """Fetch basic quote info."""
    try:
        ticker = yf.Ticker(stock)
        info = ticker.info

        return {
            "success": True,
            "type": "yfinance",
            "subtype": "quote",
            "stock": stock,
            "data": info,
        }

    except Exception as e:
        raise Exception(f"yfinance quote request failed: {str(e)}")


def get_yahoo_finance_quote_summary(stock: str, modules: list):
    """Get detailed quote summary."""
    cache_key = f"yahoo_quote_summary:{stock}:{','.join(sorted(modules))}"
    return cache_wrapper(cache_key, lambda: _fetch_quote_summary(stock, modules), 3600)


def _fetch_quote_summary(stock: str, modules: list):
    """Fetch detailed quote summary."""
    try:
        ticker = yf.Ticker(stock)

        # Get different types of data based on modules
        data = {}

        if "assetProfile" in modules:
            data["assetProfile"] = ticker.info

        if "summaryDetail" in modules:
            # Basic summary is in info
            summary_keys = [
                "previousClose",
                "open",
                "dayLow",
                "dayHigh",
                "volume",
                "averageVolume",
                "marketCap",
                "beta",
                "peRatio",
                "eps",
            ]
            data["summaryDetail"] = {
                k: ticker.info.get(k) for k in summary_keys if k in ticker.info
            }

        # Add more modules as needed...

        return {
            "success": True,
            "type": "yfinance",
            "subtype": "quoteSummary",
            "stock": stock,
            "modules": modules,
            "data": data,
        }

    except Exception as e:
        raise Exception(f"yfinance quoteSummary request failed: {str(e)}")


def get_yahoo_finance_historical(stock: str, interval: str = "1d", days: int = 30):
    """Get historical data."""
    cache_key = f"yahoo_historical:{stock}:{interval}:{days}"
    return cache_wrapper(
        cache_key, lambda: _fetch_historical(stock, interval, days), 3600
    )


def _fetch_historical(stock: str, interval: str, days: int):
    """Fetch historical data."""
    try:
        valid_days = min(days, 3650)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=valid_days)

        ticker = yf.Ticker(stock)
        data = ticker.history(start=start_date, end=end_date, interval=interval)

        # Convert to list
        historical = []
        for date, row in data.iterrows():
            historical.append(
                {
                    "date": date.isoformat(),
                    "open": row.get("Open"),
                    "high": row.get("High"),
                    "low": row.get("Low"),
                    "close": row.get("Close"),
                    "volume": row.get("Volume"),
                }
            )

        return {
            "success": True,
            "type": "yfinance",
            "subtype": "historical",
            "stock": stock,
            "interval": interval,
            "days": valid_days,
            "data": historical,
        }

    except Exception as e:
        raise Exception(f"yfinance historical request failed: {str(e)}")


def get_yahoo_finance_search(query: str, count: int = 10):
    """Search for stocks."""
    cache_key = f"yahoo_search:{query}:{count}"
    return cache_wrapper(cache_key, lambda: _fetch_search(query, count), 3600)


def _fetch_search(query: str, count: int):
    """Fetch search results."""
    try:
        # yfinance doesn't have a direct search, so we'll simulate with tickers
        # In a real implementation, you'd use Yahoo's search API
        return {
            "success": True,
            "type": "yfinance",
            "subtype": "search",
            "query": query,
            "count": min(count, 50),
            "data": [],  # Placeholder
        }

    except Exception as e:
        raise Exception(f"yfinance search request failed: {str(e)}")


# Additional helper functions can be added as needed...
