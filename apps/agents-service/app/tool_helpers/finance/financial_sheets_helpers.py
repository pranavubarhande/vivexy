import pandas as pd
import requests
from bs4 import BeautifulSoup

from .cache_helpers import cache_wrapper
from .headers_helpers import HEADERS


def parse_financial_table(table):
    """Parse a financial data table into a pandas DataFrame"""
    try:
        rows = []
        headers = []

        # Try to extract headers from thead first
        thead = table.find("thead")
        if thead:
            header_row = thead.find("tr")
            if header_row:
                headers = [th.get_text(strip=True) for th in header_row.find_all("th")]

        # If no thead, try to get headers from first row
        if not headers:
            first_tr = table.find("tr")
            if first_tr:
                headers = [th.get_text(strip=True) for th in first_tr.find_all("th")]
                if headers:
                    # Remove the header row from data if we use it for headers
                    table = table.find_next_sibling("tbody") or table

        # Extract data rows from tbody or direct tr elements
        tbody = table.find("tbody")
        if tbody:
            data_rows = tbody.find_all("tr")
        else:
            # For tables without tbody
            data_rows = table.find_all("tr")

        for tr in data_rows:
            # Skip header rows
            if tr.find("th"):
                continue

            row_data = []
            for td in tr.find_all(["td", "th"]):
                row_data.append(td.get_text(strip=True))
            if row_data:
                rows.append(row_data)

        # Create DataFrame
        if headers and rows:
            df = pd.DataFrame(rows, columns=headers)
            return df

    except Exception as e:
        print(f"Warning: Could not parse table: {e}")

    return None


def extract_basic_info(soup):
    """Extract basic company information from the page"""
    info = {}

    try:
        # Company name
        name_tag = soup.find("h1", {"class": "margin-0"})
        if name_tag:
            info["company_name"] = name_tag.get_text(strip=True)

        # Top ratios (Market Cap, Current Price, etc.)
        top_ratios = soup.find_all("li", {"class": "flex flex-space-between"})
        for ratio in top_ratios:
            name_span = ratio.find("span", {"class": "name"})
            number_span = ratio.find("span", {"class": "number"})
            if name_span and number_span:
                key = name_span.get_text(strip=True)
                value = number_span.get_text(strip=True)
                info[key] = value

        # Additional ratios from the main ratio section
        ratio_section = soup.find("div", {"id": "top-ratios"})
        if ratio_section:
            ratio_items = ratio_section.find_all("li")
            for item in ratio_items:
                spans = item.find_all("span")
                if len(spans) >= 2:
                    key = spans[0].get_text(strip=True)
                    value = spans[1].get_text(strip=True)
                    if key and value:
                        info[key] = value

    except Exception as e:
        print(f"Warning: Could not extract some basic info: {e}")

    return info


def extract_ratios(soup):
    """Extract key financial ratios from multiple sections"""
    ratios = {}

    try:
        # 1. Extract ratios from the main ratios section (existing logic)
        ratio_divs = soup.find_all("div", {"class": "show-all"})
        for div in ratio_divs:
            items = div.find_all("li", {"class": "flex flex-space-between"})
            for item in items:
                name_span = item.find("span", {"class": "name"})
                number_span = item.find("span", {"class": "number"})
                if name_span and number_span:
                    key = name_span.get_text(strip=True)
                    value = number_span.get_text(strip=True)
                    ratios[key] = value

        # 2. Extract ratios from top-ratios section (already in basic_info but also add to ratios)
        top_ratios = soup.find("div", {"id": "top-ratios"})
        if top_ratios:
            ratio_items = top_ratios.find_all(
                "li", {"class": "flex flex-space-between"}
            )
            for item in ratio_items:
                name_span = item.find("span", {"class": "name"})
                number_span = item.find("span", {"class": "number"})
                if name_span and number_span:
                    key = name_span.get_text(strip=True)
                    value = number_span.get_text(strip=True)
                    ratios[key] = value

        # 3. Extract ratios from any section with key metrics
        key_metrics_sections = soup.find_all("div", {"class": "company-ratios"})
        for section in key_metrics_sections:
            items = section.find_all("li", {"class": "flex flex-space-between"})
            for item in items:
                name_span = item.find("span", {"class": "name"})
                number_span = item.find("span", {"class": "number"})
                if name_span and number_span:
                    key = name_span.get_text(strip=True)
                    value = number_span.get_text(strip=True)
                    ratios[key] = value

        # 4. Extract from the ratios table directly (if it exists as a table)
        ratios_tables = soup.find_all("table")
        for table in ratios_tables:
            heading = table.find_previous("h2")
            if heading and (
                "Ratios" in heading.get_text(strip=True)
                or "Ratio" in heading.get_text(strip=True)
            ):
                df = parse_financial_table(table)
                if df is not None and not df.empty:
                    # Convert the first row of ratios to key-value pairs
                    for col in df.columns:
                        if col in df.columns and not df[col].isna().all():
                            value = (
                                df[col].iloc[0] if not df[col].isna().iloc[0] else "N/A"
                            )
                            ratios[col] = str(value)

        # 5. Extract from sections with specific ratio categories
        ratio_sections = soup.find_all(
            ["section", "div"], {"class": ["ratios", "key-ratios", "financial-ratios"]}
        )
        for section in ratio_sections:
            ratio_items = section.find_all("li")
            for item in ratio_items:
                spans = item.find_all("span")
                if len(spans) >= 2:
                    key = spans[0].get_text(strip=True)
                    value = spans[1].get_text(strip=True)
                    if key and value:
                        ratios[key] = value

    except Exception as e:
        print(f"Warning: Could not extract some ratios: {e}")

    return ratios


def scrape_company_fundamentals(symbol, consolidated=True):
    """
    Scrape company fundamentals from Screener.in

    Parameters:
    -----------
    symbol : str
        Company symbol (e.g., 'SEJALLTD', 'RELIANCE', 'TCS')
    consolidated : bool
        If True, fetches consolidated financials, else standalone

    Returns:
    --------
    dict : Dictionary containing all fundamental data including:
           - basic_info: Company name, market cap, current price, etc.
           - quarterly_results: Latest quarterly financial data
           - profit_loss: Annual P&L statement
           - balance_sheet: Annual balance sheet data
           - cash_flow: Annual cash flow statement
           - ratios: Key financial ratios
           - shareholding_pattern: Shareholding pattern data
    """

    # Construct URL
    if consolidated:
        url = f"https://www.screener.in/company/{symbol}/consolidated/"
    else:
        url = f"https://www.screener.in/company/{symbol}/"

    cache_key = f"financial_sheets:{url}"
    return cache_wrapper(cache_key, lambda: _scrape_fundamentals(symbol, url), 86400)


def _scrape_fundamentals(symbol, url):
    """Internal scraping function."""
    # Initialize result dictionary
    fundamentals = {
        "symbol": symbol,
        "url": url,
        "basic_info": {},
        "quarterly_results": None,
        "profit_loss": None,
        "balance_sheet": None,
        "cash_flow": None,
        "ratios": {},
        "shareholding_pattern": None,
    }

    try:
        # Make request
        response = requests.get(url, headers=HEADERS, timeout=10)
        response.raise_for_status()

        # Parse HTML
        soup = BeautifulSoup(response.content, "html.parser")

        # Extract basic company information
        fundamentals["basic_info"] = extract_basic_info(soup)

        # Extract financial tables
        tables = soup.find_all("table", {"class": "data-table"})

        # Also find tables with multiple classes that include data-table
        all_tables = soup.find_all("table")
        for table in all_tables:
            classes = table.get("class", [])
            if any("data-table" in cls for cls in classes):
                tables.append(table)

        # Remove duplicates
        seen = set()
        unique_tables = []
        for table in tables:
            table_id = str(table)
            if table_id not in seen:
                seen.add(table_id)
                unique_tables.append(table)
        tables = unique_tables

        for table in tables:
            # Check table heading to identify which financial statement it is
            heading = table.find_previous("h2")
            table_classes = table.get("class", [])
            heading_text = heading.get_text(strip=True) if heading else ""

            if heading:
                if "Quarterly Results" in heading_text:
                    fundamentals["quarterly_results"] = parse_financial_table(table)
                elif "Profit & Loss" in heading_text:
                    fundamentals["profit_loss"] = parse_financial_table(table)
                elif "Balance Sheet" in heading_text:
                    fundamentals["balance_sheet"] = parse_financial_table(table)
                elif "Cash Flow" in heading_text:
                    fundamentals["cash_flow"] = parse_financial_table(table)
                elif "Shareholding Pattern" in heading_text:
                    fundamentals["shareholding_pattern"] = parse_financial_table(table)

        # Extract ratios separately
        fundamentals["ratios"] = extract_ratios(soup)

        # Convert all DataFrames to dicts for JSON serialization
        for key, value in fundamentals.items():
            if isinstance(value, pd.DataFrame):
                fundamentals[key] = value.replace({float("nan"): None}).to_dict(
                    orient="records"
                )

        print(f"✓ Successfully scraped fundamentals for {symbol}")
        return fundamentals

    except requests.exceptions.RequestException as e:
        print(f"✗ Error fetching data for {symbol}: {e}")
        return fundamentals
    except Exception as e:
        print(f"✗ Error parsing data for {symbol}: {e}")
        return fundamentals


def get_financial_sheets(stock: str, subtype: str = None):
    """Get financial sheets for a stock."""
    try:
        sheets = scrape_company_fundamentals(stock, consolidated=True)

        if not subtype:
            return {
                "success": True,
                "stock": stock,
                "type": "financial_sheets",
                "data": sheets,
            }

        # Specific sheet
        sheet_data = sheets.get(subtype)
        if sheet_data is None:
            available = [
                k
                for k, v in sheets.items()
                if v is not None and k != "symbol" and k != "url"
            ]
            raise ValueError(
                f"Sheet '{subtype}' not found. Available: {', '.join(available)}"
            )

        return {
            "success": True,
            "stock": stock,
            "type": "financial_sheet",
            "subtype": subtype,
            "data": sheet_data,
        }

    except Exception as e:
        raise Exception(f"Error getting financial sheets for {stock}: {str(e)}")
