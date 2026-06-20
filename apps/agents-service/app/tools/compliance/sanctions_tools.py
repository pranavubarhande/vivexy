"""
Sanctions screening tools — OFAC SDN list, EU consolidated list, UN sanctions.
Downloads lists on first use and caches them in memory for the process lifetime.
No API key required — all lists are publicly available.
"""

import json
import os
import re
import threading
from typing import List, Optional
from xml.etree import ElementTree

import httpx
from langchain_core.tools import BaseTool, tool

_OFAC_SDN_URL = "https://www.treasury.gov/ofac/downloads/sdn.xml"
_ofac_cache: Optional[list] = None
_ofac_lock = threading.Lock()


def _load_ofac_sdn() -> list:
    global _ofac_cache
    with _ofac_lock:
        if _ofac_cache is not None:
            return _ofac_cache
        try:
            resp = httpx.get(_OFAC_SDN_URL, timeout=60, follow_redirects=True)
            resp.raise_for_status()
            root = ElementTree.fromstring(resp.content)
            ns = {
                "ns": "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/XML"
            }
            entries = []
            for entry in root.findall(".//ns:sdnEntry", ns) or root.findall(
                ".//sdnEntry"
            ):
                names = []
                # Primary name
                last = entry.findtext(".//lastName", "") or entry.findtext(
                    ".//ns:lastName", "", ns
                )
                first = entry.findtext(".//firstName", "") or entry.findtext(
                    ".//ns:firstName", "", ns
                )
                if last:
                    names.append(f"{first} {last}".strip() if first else last)
                # AKAs
                for aka in entry.findall(".//aka") or entry.findall(".//ns:aka", ns):
                    aka_last = aka.findtext("lastName", "") or aka.findtext(
                        "ns:lastName", "", ns
                    )
                    aka_first = aka.findtext("firstName", "") or aka.findtext(
                        "ns:firstName", "", ns
                    )
                    if aka_last:
                        names.append(
                            f"{aka_first} {aka_last}".strip() if aka_first else aka_last
                        )
                sdn_type = entry.findtext("sdnType", "") or entry.findtext(
                    "ns:sdnType", "", ns
                )
                uid = entry.findtext("uid", "") or entry.findtext("ns:uid", "", ns)
                entries.append({"uid": uid, "names": names, "type": sdn_type})
            _ofac_cache = entries
        except Exception as e:
            _ofac_cache = []
        return _ofac_cache


def _fuzzy_match(name: str, candidates: list, threshold: float = 0.75) -> list:
    """Simple token-overlap fuzzy match — no external deps needed."""
    name_tokens = set(re.sub(r"[^a-z\s]", "", name.lower()).split())
    if not name_tokens:
        return []
    matches = []
    for entry in candidates:
        for candidate_name in entry["names"]:
            cand_tokens = set(re.sub(r"[^a-z\s]", "", candidate_name.lower()).split())
            if not cand_tokens:
                continue
            overlap = len(name_tokens & cand_tokens) / max(
                len(name_tokens), len(cand_tokens)
            )
            if overlap >= threshold:
                matches.append(
                    {
                        "uid": entry["uid"],
                        "matched_name": candidate_name,
                        "entity_type": entry["type"],
                        "match_score": round(overlap, 3),
                    }
                )
    return sorted(matches, key=lambda x: -x["match_score"])[:5]


@tool
def screen_ofac_sdn(name: str) -> str:
    """Screen a name against the OFAC Specially Designated Nationals (SDN) list.
    Downloads the list on first call (~4 MB XML). Results include match score.
    Args:
        name: Individual or entity name to screen (e.g. 'John Smith', 'Acme Trading LLC')
    """
    try:
        entries = _load_ofac_sdn()
        if not entries:
            return json.dumps({"error": "Failed to load OFAC SDN list"})
        matches = _fuzzy_match(name, entries)
        return json.dumps(
            {
                "name_screened": name,
                "list": "OFAC SDN",
                "total_entries_checked": len(entries),
                "matches": matches,
                "result": "MATCH" if matches else "CLEAR",
            }
        )
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def screen_un_sanctions(name: str) -> str:
    """Screen a name against the UN Security Council consolidated sanctions list.
    Args:
        name: Individual or entity name to screen
    """
    try:
        resp = httpx.get(
            "https://scsanctions.un.org/resources/xml/en/consolidated.xml",
            timeout=60,
            follow_redirects=True,
        )
        resp.raise_for_status()
        root = ElementTree.fromstring(resp.content)
        name_lower = name.lower()
        matches = []
        for individual in root.findall(".//INDIVIDUAL") + root.findall(".//ENTITY"):
            first = (individual.findtext("FIRST_NAME") or "").lower()
            second = (individual.findtext("SECOND_NAME") or "").lower()
            full = f"{first} {second}".strip()
            entity_name = (
                individual.findtext("NAME_ORIGINAL_SCRIPT")
                or individual.findtext("FIRST_NAME")
                or ""
            ).lower()
            candidate = full or entity_name
            name_tokens = set(re.sub(r"[^a-z\s]", "", name_lower).split())
            cand_tokens = set(re.sub(r"[^a-z\s]", "", candidate).split())
            if name_tokens and cand_tokens:
                overlap = len(name_tokens & cand_tokens) / max(
                    len(name_tokens), len(cand_tokens)
                )
                if overlap >= 0.75:
                    matches.append(
                        {"matched_name": candidate, "score": round(overlap, 3)}
                    )
        matches = sorted(matches, key=lambda x: -x["score"])[:5]
        return json.dumps(
            {
                "name_screened": name,
                "list": "UN Consolidated",
                "matches": matches,
                "result": "MATCH" if matches else "CLEAR",
            }
        )
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_sanctions_list_metadata() -> str:
    """Get metadata about available sanctions lists — names, sources, last update info."""
    return json.dumps(
        {
            "lists": [
                {
                    "name": "OFAC SDN",
                    "source": "US Treasury",
                    "url": _OFAC_SDN_URL,
                    "coverage": "US primary sanctions",
                },
                {
                    "name": "UN Consolidated",
                    "source": "UN Security Council",
                    "url": "https://scsanctions.un.org",
                    "coverage": "UN chapter VII sanctions",
                },
                {
                    "name": "EU Consolidated",
                    "source": "European Union",
                    "url": "https://webgate.ec.europa.eu/fsd/fsf",
                    "coverage": "EU restrictive measures",
                },
                {
                    "name": "HMT",
                    "source": "HM Treasury UK",
                    "url": "https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.csv",
                    "coverage": "UK financial sanctions",
                },
            ]
        }
    )


def get_sanctions_tools() -> List[BaseTool]:
    return [screen_ofac_sdn, screen_un_sanctions, get_sanctions_list_metadata]
