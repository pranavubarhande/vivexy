"""
Regulatory feed tools — RSS/Atom feeds from SEC, CFTC, FCA, OCC, EBA, ESMA.
No API key required — all feeds are public.
"""

import json
from datetime import datetime, timezone
from typing import List
from xml.etree import ElementTree

import httpx
from langchain_core.tools import BaseTool, tool

_FEEDS = {
    "sec_press": ("SEC", "https://www.sec.gov/rss/news/pressreleases.rss"),
    "sec_rules": ("SEC", "https://www.sec.gov/rss/rules/proposed.rss"),
    "sec_final": ("SEC", "https://www.sec.gov/rss/rules/final.rss"),
    "cftc": ("CFTC", "https://www.cftc.gov/rss/pressreleases/index.xml"),
    "occ": ("OCC", "https://www.occ.gov/tools-forms/rss/news-issuances-rss.xml"),
    "fca": ("FCA", "https://www.fca.org.uk/news/rss.xml"),
    "esma": ("ESMA", "https://www.esma.europa.eu/press-news/esma-news/rss"),
}

_NS = {"atom": "http://www.w3.org/2005/Atom"}


def _parse_feed(url: str, source_name: str, limit: int = 5) -> list:
    try:
        resp = httpx.get(
            url,
            timeout=15,
            follow_redirects=True,
            headers={"User-Agent": "portfolio-helper research@example.com"},
        )
        resp.raise_for_status()
        root = ElementTree.fromstring(resp.content)

        items = []
        # RSS 2.0 format
        for item in (root.findall(".//item") or [])[:limit]:
            items.append(
                {
                    "source": source_name,
                    "title": (item.findtext("title") or "").strip(),
                    "date": (
                        item.findtext("pubDate") or item.findtext("dc:date") or ""
                    ).strip(),
                    "link": (item.findtext("link") or "").strip(),
                    "summary": (item.findtext("description") or "").strip()[:300],
                }
            )
        # Atom format
        if not items:
            for entry in (
                root.findall("atom:entry", _NS) or root.findall("entry") or []
            )[:limit]:
                link_el = entry.find("atom:link", _NS) or entry.find("link")
                items.append(
                    {
                        "source": source_name,
                        "title": (
                            entry.findtext("atom:title", namespaces=_NS)
                            or entry.findtext("title")
                            or ""
                        ).strip(),
                        "date": (
                            entry.findtext("atom:published", namespaces=_NS)
                            or entry.findtext("published")
                            or ""
                        ).strip(),
                        "link": (
                            link_el.get("href", "") if link_el is not None else ""
                        ),
                        "summary": (
                            entry.findtext("atom:summary", namespaces=_NS)
                            or entry.findtext("summary")
                            or ""
                        ).strip()[:300],
                    }
                )
        return items
    except Exception as e:
        return [{"source": source_name, "error": str(e)}]


@tool
def get_regulatory_updates(regulators: str = "all", limit_per_feed: int = 3) -> str:
    """Fetch the latest updates from regulatory body feeds (SEC, CFTC, FCA, OCC, ESMA).
    Args:
        regulators: Comma-separated list of regulators to query, or 'all'
                    Options: sec_press, sec_rules, sec_final, cftc, occ, fca, esma
        limit_per_feed: Max items per feed (default 3)
    """
    selected = (
        list(_FEEDS.keys())
        if regulators.strip().lower() == "all"
        else [r.strip() for r in regulators.split(",") if r.strip() in _FEEDS]
    )
    if not selected:
        return json.dumps(
            {"error": f"Unknown regulators. Valid: {', '.join(_FEEDS.keys())}"}
        )

    all_items = []
    for key in selected:
        source_name, url = _FEEDS[key]
        all_items.extend(_parse_feed(url, source_name, limit=limit_per_feed))

    return json.dumps(
        {"retrieved_at": datetime.now(timezone.utc).isoformat(), "items": all_items}
    )


@tool
def search_regulatory_updates(keyword: str, regulators: str = "all") -> str:
    """Search regulatory feed items for a specific keyword.
    Args:
        keyword: Keyword to search for in titles and summaries (e.g. 'AML', 'climate risk', 'crypto')
        regulators: Comma-separated list of regulators to search, or 'all'
    """
    selected = (
        list(_FEEDS.keys())
        if regulators.strip().lower() == "all"
        else [r.strip() for r in regulators.split(",") if r.strip() in _FEEDS]
    )
    keyword_lower = keyword.lower()
    all_items = []
    for key in selected:
        source_name, url = _FEEDS[key]
        items = _parse_feed(url, source_name, limit=10)
        for item in items:
            if (
                keyword_lower in item.get("title", "").lower()
                or keyword_lower in item.get("summary", "").lower()
            ):
                all_items.append(item)

    return json.dumps(
        {
            "keyword": keyword,
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "matches": all_items,
        }
    )


def get_regulatory_feed_tools() -> List[BaseTool]:
    return [get_regulatory_updates, search_regulatory_updates]
