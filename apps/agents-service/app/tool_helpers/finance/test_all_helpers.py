from cache_helpers import delete_cache, get_cache, set_cache
from financial_sheets_helpers import get_financial_sheets
from headers_helpers import HEADERS
from news_helpers import get_stock_news
from yahoo_finance_helpers import get_stock_quote, get_yahoo_finance_quote


def main():
    print("Testing tool helpers...")

    print("\n=== Testing Cache Helpers ===")
    try:
        # Test set and get
        set_cache("test_key", "test_value")
        value = get_cache("test_key")
        print(f"Set and got cache: {value}")

        # Test delete
        delete_cache("test_key")
        value = get_cache("test_key")
        print(f"After delete: {value}")
    except Exception as e:
        print(f"Cache test error: {e}")

    print("\n=== Testing Headers ===")
    print(f"HEADERS: {HEADERS}")

    print("\n=== Testing News Helpers ===")
    try:
        news = get_stock_news("AAPL", 3)
        print(f"News for AAPL: {news}")
    except Exception as e:
        print(f"News test error: {e}")

    print("\n=== Testing Yahoo Finance Quote ===")
    try:
        quote = get_yahoo_finance_quote("AAPL")
        print(f"Yahoo quote for AAPL: {quote}")
    except Exception as e:
        print(f"Yahoo quote test error: {e}")

    print("\n=== Testing Stock Quote ===")
    try:
        stock_quote = get_stock_quote("AAPL", "1d", 7)
        print(f"Stock quote for AAPL: {stock_quote}")
    except Exception as e:
        print(f"Stock quote test error: {e}")

    print("\n=== Testing Financial Sheets ===")
    try:
        sheets = get_financial_sheets("RELIANCE")
        print(f"Financial sheets for RELIANCE: {sheets}")
    except Exception as e:
        print(f"Financial sheets test error: {e}")


if __name__ == "__main__":
    main()
