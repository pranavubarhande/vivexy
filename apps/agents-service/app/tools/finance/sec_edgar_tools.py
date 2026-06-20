"""
SEC EDGAR tools — free, no API key required.
Uses the EDGAR full-text search API (efts.sec.gov) and company facts API.
"""

import json
from typing import List

import httpx
from langchain_core.tools import BaseTool, tool

_EDGAR_BASE = "https://efts.sec.gov"
_EDGAR_DATA = "https://data.sec.gov"
_HEADERS = {"User-Agent": "portfolio-helper research@example.com"}


@tool
def search_sec_filings(query: str, form_type: str = "", date_range: str = "") -> str:
    """Search SEC EDGAR full-text search for filings matching a query.
    Args:
        query: Search terms (e.g. 'goodwill impairment technology sector')
        form_type: Optional filing type filter (e.g. '10-K', '10-Q', '8-K', 'S-1')
        date_range: Optional date range as 'YYYY-MM-DD,YYYY-MM-DD'
    """
    try:
        params: dict = {"q": f'"{query}"', "dateRange": "custom" if date_range else ""}
        if form_type:
            params["forms"] = form_type
        if date_range:
            parts = date_range.split(",")
            if len(parts) == 2:
                params["startdt"], params["enddt"] = parts[0].strip(), parts[1].strip()
        resp = httpx.get(
            f"{_EDGAR_BASE}/efts/hits.json", params=params, headers=_HEADERS, timeout=15
        )
        resp.raise_for_status()
        data = resp.json()
        hits = data.get("hits", {}).get("hits", [])[:5]
        results = []
        for h in hits:
            src = h.get("_source", {})
            results.append(
                {
                    "entity": src.get("entity_name", ""),
                    "form_type": src.get("form_type", ""),
                    "filed_at": src.get("file_date", ""),
                    "description": src.get("period_of_report", ""),
                    "url": f"https://www.sec.gov/Archives/{src.get('file_path', '')}",
                }
            )
        return json.dumps(
            {
                "total": data.get("hits", {}).get("total", {}).get("value", 0),
                "results": results,
            }
        )
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_company_facts(cik: str, concept: str = "us-gaap/Revenues") -> str:
    """Get structured financial facts for a company from SEC EDGAR.
    Args:
        cik: SEC Central Index Key (10-digit, e.g. '0000320193' for Apple)
        concept: XBRL concept to retrieve (e.g. 'us-gaap/Revenues', 'us-gaap/Assets', 'us-gaap/NetIncomeLoss')
    """
    try:
        cik_padded = cik.lstrip("0").zfill(10)
        taxonomy, tag = concept.split("/") if "/" in concept else ("us-gaap", concept)
        url = f"{_EDGAR_DATA}/api/xbrl/companyconcept/CIK{cik_padded}/{taxonomy}/{tag}.json"
        resp = httpx.get(url, headers=_HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        units = data.get("units", {})
        unit_key = next(iter(units), None)
        recent = sorted(
            units.get(unit_key, []), key=lambda x: x.get("end", ""), reverse=True
        )[:8]
        return json.dumps(
            {
                "entity": data.get("entityName", ""),
                "concept": concept,
                "unit": unit_key,
                "recent_values": recent,
            }
        )
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def lookup_company_cik(company_name: str) -> str:
    """Look up a company's SEC CIK number by name.
    Args:
        company_name: Company name to search for (e.g. 'Apple Inc', 'Microsoft')
    """
    try:
        resp = httpx.get(
            "https://efts.sec.gov/LATEST/search-index?q=%22{}%22&dateRange=custom&startdt=2020-01-01&enddt=2025-12-31&forms=10-K".format(
                company_name.replace(" ", "+")
            ),
            headers=_HEADERS,
            timeout=10,
        )
        # Use the company search endpoint instead
        resp2 = httpx.get(
            f"https://efts.sec.gov/efts/hits.json",
            params={"q": company_name, "forms": "10-K"},
            headers=_HEADERS,
            timeout=10,
        )
        resp2.raise_for_status()
        hits = resp2.json().get("hits", {}).get("hits", [])[:3]
        results = [
            {
                "entity": h["_source"].get("entity_name", ""),
                "cik": h["_source"].get("cik", ""),
            }
            for h in hits
        ]
        return json.dumps({"results": results})
    except Exception as e:
        return json.dumps({"error": str(e)})


def get_sec_edgar_tools() -> List[BaseTool]:
    return [search_sec_filings, get_company_facts, lookup_company_cik]
