"""
Legal research tools — statute lookup, citation formatting, jurisdiction guidance.
"""

import json
from typing import List

import httpx
from langchain_core.tools import BaseTool, tool


@tool
def search_us_code(query: str, title: str = "") -> str:
    """Search the US Code (federal statutes) via the govinfo API.
    Args:
        query: Search terms (e.g. 'insider trading materiality standard')
        title: Optional USC title number to narrow search (e.g. '15' for Commerce/Trade)
    """
    try:
        params: dict = {
            "query": query,
            "pageSize": 5,
            "offsetMark": "*",
            "collection": "USCODE",
        }
        if title:
            params["title"] = title
        resp = httpx.get(
            "https://api.govinfo.gov/search",
            params=params,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        results = []
        for r in (data.get("results") or [])[:5]:
            results.append(
                {
                    "title": r.get("title", ""),
                    "citation": r.get("granuleId", ""),
                    "date": r.get("dateIssued", ""),
                    "url": r.get("download", {}).get("pdfLink", ""),
                }
            )
        return json.dumps({"count": data.get("count", 0), "results": results})
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def format_legal_citation(
    case_name: str, reporter: str, volume: str, page: str, year: str, court: str = ""
) -> str:
    """Format a legal citation in Bluebook style.
    Args:
        case_name: Full case name (e.g. 'Smith v. Jones')
        reporter: Reporter abbreviation (e.g. 'F.3d', 'U.S.', 'S. Ct.')
        volume: Volume number
        page: First page number
        year: Year of decision
        court: Court abbreviation (omit for US Supreme Court)
    """
    court_str = f" {court}" if court else ""
    citation = f"{case_name}, {volume} {reporter} {page} ({court_str}{year}).".strip()
    return json.dumps({"citation": citation, "format": "Bluebook"})


@tool
def search_cfr(query: str, title: str = "") -> str:
    """Search the Code of Federal Regulations for relevant regulatory provisions.
    Args:
        query: Search terms (e.g. 'beneficial ownership reporting threshold')
        title: Optional CFR title number (e.g. '17' for SEC, '12' for banking, '26' for IRS)
    """
    try:
        params: dict = {
            "query": query,
            "pageSize": 5,
            "offsetMark": "*",
            "collection": "CFR",
        }
        if title:
            params["title"] = title
        resp = httpx.get("https://api.govinfo.gov/search", params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        results = [
            {
                "title": r.get("title", ""),
                "granule": r.get("granuleId", ""),
                "date": r.get("dateIssued", ""),
            }
            for r in (data.get("results") or [])[:5]
        ]
        return json.dumps({"count": data.get("count", 0), "results": results})
    except Exception as e:
        return json.dumps({"error": str(e)})


def get_legal_research_tools() -> List[BaseTool]:
    return [search_us_code, format_legal_citation, search_cfr]
