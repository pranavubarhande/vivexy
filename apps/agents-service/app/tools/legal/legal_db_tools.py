"""
Legal database tools — case law, court opinions, patent search.
Uses CourtListener API (free, no key for basic search) and USPTO Patent API.
"""

import json
import os
from typing import List

import httpx
from langchain_core.tools import BaseTool, tool

_COURTLISTENER_BASE = "https://www.courtlistener.com/api/rest/v3"
_USPTO_BASE = "https://developer.uspto.gov/ibd-api/v1"
_CL_TOKEN = os.getenv("COURTLISTENER_API_TOKEN", "")


def _cl_headers() -> dict:
    h = {"User-Agent": "portfolio-helper research@example.com"}
    if _CL_TOKEN:
        h["Authorization"] = f"Token {_CL_TOKEN}"
    return h


@tool
def search_case_law(query: str, jurisdiction: str = "", after_date: str = "") -> str:
    """Search for case law opinions using CourtListener.
    Args:
        query: Legal search terms (e.g. 'breach of fiduciary duty hedge fund')
        jurisdiction: Optional court jurisdiction code (e.g. 'scotus', 'ca2', 'deld')
        after_date: Optional filter for opinions after this date (YYYY-MM-DD)
    """
    try:
        params: dict = {
            "q": query,
            "type": "o",
            "order_by": "score desc",
            "page_size": 5,
        }
        if jurisdiction:
            params["court"] = jurisdiction
        if after_date:
            params["filed_after"] = after_date
        resp = httpx.get(
            f"{_COURTLISTENER_BASE}/search/",
            params=params,
            headers=_cl_headers(),
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        results = []
        for r in data.get("results", [])[:5]:
            results.append(
                {
                    "case_name": r.get("caseName", ""),
                    "court": r.get("court", ""),
                    "date_filed": r.get("dateFiled", ""),
                    "citation": r.get("citation", []),
                    "url": f"https://www.courtlistener.com{r.get('absolute_url', '')}",
                    "snippet": r.get("snippet", "")[:300],
                }
            )
        return json.dumps({"count": data.get("count", 0), "results": results})
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_opinion_text(opinion_id: str) -> str:
    """Retrieve the full text of a CourtListener opinion by ID.
    Args:
        opinion_id: CourtListener opinion ID (numeric string from search results)
    """
    try:
        resp = httpx.get(
            f"{_COURTLISTENER_BASE}/opinions/{opinion_id}/",
            headers=_cl_headers(),
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        text = data.get("plain_text", "") or data.get("html_with_citations", "")
        return json.dumps(
            {
                "case_name": (
                    data.get("cluster", {}).get("case_name", "")
                    if isinstance(data.get("cluster"), dict)
                    else ""
                ),
                "text": text[:4000],
            }
        )
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def search_patents(query: str, date_range: str = "") -> str:
    """Search USPTO patents by keyword.
    Args:
        query: Patent search terms (e.g. 'machine learning fraud detection financial services')
        date_range: Optional date range as 'YYYY-MM-DD,YYYY-MM-DD'
    """
    try:
        body: dict = {
            "criteria": {
                "patent_title": query,
            },
            "pagination": {"offset": 0, "limit": 5},
            "fields": [
                "patent_title",
                "patent_number",
                "patent_date",
                "assignee_organization",
                "patent_abstract",
            ],
        }
        resp = httpx.post(
            "https://api.patentsview.org/patents/query",
            json=body,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        patents = data.get("patents", []) or []
        results = [
            {
                "number": p.get("patent_number", ""),
                "title": p.get("patent_title", ""),
                "date": p.get("patent_date", ""),
                "assignee": (
                    p.get("assignees", [{}])[0].get("assignee_organization", "")
                    if p.get("assignees")
                    else ""
                ),
                "abstract": (p.get("patent_abstract", "") or "")[:300],
            }
            for p in patents[:5]
        ]
        return json.dumps({"count": data.get("count", 0), "results": results})
    except Exception as e:
        return json.dumps({"error": str(e)})


def get_legal_db_tools() -> List[BaseTool]:
    return [search_case_law, get_opinion_text, search_patents]
