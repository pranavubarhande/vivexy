"""
Tests for compliance domain tools:
  - audit_tools: pure computation, no external deps
  - sanctions_tools: mocked HTTP (OFAC/UN XML downloads)
  - regulatory_feed_tools: mocked HTTP (RSS feeds)
"""

import json
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest

from app.tools.compliance.audit_tools import (
    calculate_risk_score,
    generate_finding_summary,
    get_audit_tools,
    track_remediation_deadlines,
)

# ---------------------------------------------------------------------------
# audit_tools
# ---------------------------------------------------------------------------


class TestGetAuditTools:
    def test_returns_three_tools(self):
        tools = get_audit_tools()
        assert len(tools) == 3

    def test_tool_names(self):
        names = {t.name for t in get_audit_tools()}
        assert names == {
            "calculate_risk_score",
            "generate_finding_summary",
            "track_remediation_deadlines",
        }

    def test_tools_have_descriptions(self):
        for t in get_audit_tools():
            assert t.description


class TestCalculateRiskScore:
    def test_critical_score(self):
        result = json.loads(
            calculate_risk_score.invoke(
                {"likelihood": 5, "impact": 5, "control_effectiveness": 1}
            )
        )
        assert result["inherent_score"] == 25
        assert result["inherent_rating"] == "CRITICAL"

    def test_high_inherent_reduced_by_controls(self):
        result = json.loads(
            calculate_risk_score.invoke(
                {"likelihood": 4, "impact": 4, "control_effectiveness": 4}
            )
        )
        assert result["inherent_score"] == 16
        assert result["inherent_rating"] == "HIGH"
        assert result["residual_score"] < result["inherent_score"]

    def test_low_risk(self):
        result = json.loads(
            calculate_risk_score.invoke(
                {"likelihood": 1, "impact": 1, "control_effectiveness": 5}
            )
        )
        assert result["inherent_rating"] == "LOW"
        assert result["residual_rating"] == "LOW"

    def test_medium_risk(self):
        result = json.loads(
            calculate_risk_score.invoke(
                {"likelihood": 2, "impact": 3, "control_effectiveness": 3}
            )
        )
        assert result["inherent_score"] == 6
        assert result["inherent_rating"] == "MEDIUM"

    def test_invalid_input_out_of_range(self):
        result = json.loads(
            calculate_risk_score.invoke(
                {"likelihood": 0, "impact": 3, "control_effectiveness": 3}
            )
        )
        assert "error" in result

    def test_invalid_input_too_high(self):
        result = json.loads(
            calculate_risk_score.invoke(
                {"likelihood": 6, "impact": 3, "control_effectiveness": 3}
            )
        )
        assert "error" in result

    def test_recommendation_present(self):
        result = json.loads(
            calculate_risk_score.invoke(
                {"likelihood": 3, "impact": 3, "control_effectiveness": 2}
            )
        )
        assert "recommendation" in result


class TestGenerateFindingSummary:
    def _future_date(self, days=30):
        return (date.today() + timedelta(days=days)).isoformat()

    def _past_date(self, days=5):
        return (date.today() - timedelta(days=days)).isoformat()

    def test_open_finding(self):
        result = json.loads(
            generate_finding_summary.invoke(
                {
                    "title": "Missing MFA",
                    "description": "Admin accounts lack multi-factor authentication.",
                    "risk_rating": "HIGH",
                    "owner": "IT Security",
                    "due_date": self._future_date(30),
                }
            )
        )
        assert result["finding"]["status"] == "OPEN"
        assert result["finding"]["risk_rating"] == "HIGH"
        assert result["escalation_required"] is True  # HIGH always escalates

    def test_overdue_finding(self):
        result = json.loads(
            generate_finding_summary.invoke(
                {
                    "title": "Stale Access Reviews",
                    "description": "Quarterly access reviews not completed.",
                    "risk_rating": "MEDIUM",
                    "owner": "IT",
                    "due_date": self._past_date(5),
                }
            )
        )
        assert result["finding"]["status"] == "OVERDUE"
        assert result["finding"]["days_remaining"] < 0
        assert result["escalation_required"] is True  # overdue always escalates

    def test_low_risk_on_track(self):
        result = json.loads(
            generate_finding_summary.invoke(
                {
                    "title": "Documentation Gap",
                    "description": "Policy not updated.",
                    "risk_rating": "LOW",
                    "owner": "Compliance",
                    "due_date": self._future_date(60),
                }
            )
        )
        assert result["finding"]["status"] == "OPEN"
        assert result["escalation_required"] is False

    def test_invalid_risk_rating(self):
        result = json.loads(
            generate_finding_summary.invoke(
                {
                    "title": "Test",
                    "description": "Test",
                    "risk_rating": "EXTREME",
                    "owner": "Someone",
                    "due_date": self._future_date(),
                }
            )
        )
        assert "error" in result

    def test_invalid_date_format(self):
        result = json.loads(
            generate_finding_summary.invoke(
                {
                    "title": "Test",
                    "description": "Test",
                    "risk_rating": "LOW",
                    "owner": "Someone",
                    "due_date": "31-12-2025",
                }
            )
        )
        assert "error" in result

    def test_suggested_evidence_present(self):
        result = json.loads(
            generate_finding_summary.invoke(
                {
                    "title": "Test",
                    "description": "Test",
                    "risk_rating": "LOW",
                    "owner": "Someone",
                    "due_date": self._future_date(),
                }
            )
        )
        assert len(result["suggested_evidence"]) > 0


class TestTrackRemediationDeadlines:
    def test_categorises_findings_correctly(self):
        today = date.today()
        findings = [
            {
                "title": "Overdue item",
                "due_date": (today - timedelta(days=5)).isoformat(),
                "risk_rating": "HIGH",
                "owner": "IT",
            },
            {
                "title": "At risk item",
                "due_date": (today + timedelta(days=10)).isoformat(),
                "risk_rating": "MEDIUM",
                "owner": "Legal",
            },
            {
                "title": "On track item",
                "due_date": (today + timedelta(days=60)).isoformat(),
                "risk_rating": "LOW",
                "owner": "Finance",
            },
        ]
        result = json.loads(
            track_remediation_deadlines.invoke({"findings_json": json.dumps(findings)})
        )
        assert result["overdue_count"] == 1
        assert result["at_risk_count"] == 1
        assert result["on_track_count"] == 1
        assert result["total_findings"] == 3

    def test_invalid_json(self):
        result = json.loads(
            track_remediation_deadlines.invoke({"findings_json": "not json"})
        )
        assert "error" in result

    def test_empty_list(self):
        result = json.loads(track_remediation_deadlines.invoke({"findings_json": "[]"}))
        assert result["total_findings"] == 0
        assert result["overdue_count"] == 0

    def test_skips_invalid_dates(self):
        findings = [
            {
                "title": "Bad date",
                "due_date": "not-a-date",
                "risk_rating": "HIGH",
                "owner": "IT",
            },
            {
                "title": "Good date",
                "due_date": (date.today() + timedelta(days=60)).isoformat(),
                "risk_rating": "LOW",
                "owner": "IT",
            },
        ]
        result = json.loads(
            track_remediation_deadlines.invoke({"findings_json": json.dumps(findings)})
        )
        # Bad date entry is skipped, only the good one counted
        assert result["total_findings"] == 2
        assert result["on_track_count"] == 1


# ---------------------------------------------------------------------------
# sanctions_tools
# ---------------------------------------------------------------------------

from app.tools.compliance.sanctions_tools import (
    get_sanctions_list_metadata,
    get_sanctions_tools,
    screen_ofac_sdn,
    screen_un_sanctions,
)


class TestGetSanctionsTools:
    def test_returns_three_tools(self):
        tools = get_sanctions_tools()
        assert len(tools) == 3

    def test_tool_names(self):
        names = {t.name for t in get_sanctions_tools()}
        assert names == {
            "screen_ofac_sdn",
            "screen_un_sanctions",
            "get_sanctions_list_metadata",
        }


class TestGetSanctionsListMetadata:
    def test_returns_four_lists(self):
        result = json.loads(get_sanctions_list_metadata.invoke({}))
        assert len(result["lists"]) == 4

    def test_list_fields_present(self):
        result = json.loads(get_sanctions_list_metadata.invoke({}))
        for lst in result["lists"]:
            assert "name" in lst
            assert "source" in lst
            assert "url" in lst
            assert "coverage" in lst

    def test_ofac_in_lists(self):
        result = json.loads(get_sanctions_list_metadata.invoke({}))
        names = [lst["name"] for lst in result["lists"]]
        assert "OFAC SDN" in names


class TestScreenOfacSdn:
    _MOCK_ENTRIES = [
        {"uid": "1001", "names": ["Viktor Bout", "Victor Bout"], "type": "Individual"},
        {"uid": "1002", "names": ["Acme Weapons LLC"], "type": "Entity"},
    ]

    def test_match_found(self):
        with patch(
            "app.tools.compliance.sanctions_tools._load_ofac_sdn",
            return_value=self._MOCK_ENTRIES,
        ):
            result = json.loads(screen_ofac_sdn.invoke({"name": "Viktor Bout"}))
        assert result["result"] == "MATCH"
        assert len(result["matches"]) > 0
        assert result["matches"][0]["match_score"] == 1.0

    def test_clear_result(self):
        with patch(
            "app.tools.compliance.sanctions_tools._load_ofac_sdn",
            return_value=self._MOCK_ENTRIES,
        ):
            result = json.loads(screen_ofac_sdn.invoke({"name": "Jane Smith"}))
        assert result["result"] == "CLEAR"
        assert result["matches"] == []

    def test_partial_match(self):
        with patch(
            "app.tools.compliance.sanctions_tools._load_ofac_sdn",
            return_value=self._MOCK_ENTRIES,
        ):
            result = json.loads(screen_ofac_sdn.invoke({"name": "Victor Bout"}))
        assert result["result"] == "MATCH"

    def test_empty_sdn_list_returns_error(self):
        with patch(
            "app.tools.compliance.sanctions_tools._load_ofac_sdn", return_value=[]
        ):
            result = json.loads(screen_ofac_sdn.invoke({"name": "anyone"}))
        assert "error" in result

    def test_response_includes_list_name(self):
        with patch(
            "app.tools.compliance.sanctions_tools._load_ofac_sdn",
            return_value=self._MOCK_ENTRIES,
        ):
            result = json.loads(screen_ofac_sdn.invoke({"name": "Jane Smith"}))
        assert result["list"] == "OFAC SDN"
        assert "total_entries_checked" in result


class TestScreenUnSanctions:
    _UN_XML = b"""<?xml version="1.0"?>
<CONSOLIDATED_LIST>
  <INDIVIDUALS>
    <INDIVIDUAL>
      <FIRST_NAME>Viktor</FIRST_NAME>
      <SECOND_NAME>Bout</SECOND_NAME>
    </INDIVIDUAL>
  </INDIVIDUALS>
  <ENTITIES/>
</CONSOLIDATED_LIST>"""

    def _make_mock_response(self, content=None):
        mock_resp = MagicMock()
        mock_resp.content = content or self._UN_XML
        mock_resp.raise_for_status = MagicMock()
        return mock_resp

    def test_match_found(self):
        with patch(
            "app.tools.compliance.sanctions_tools.httpx.get",
            return_value=self._make_mock_response(),
        ):
            result = json.loads(screen_un_sanctions.invoke({"name": "Viktor Bout"}))
        assert result["result"] == "MATCH"

    def test_clear_result(self):
        with patch(
            "app.tools.compliance.sanctions_tools.httpx.get",
            return_value=self._make_mock_response(),
        ):
            result = json.loads(screen_un_sanctions.invoke({"name": "Jane Smith"}))
        assert result["result"] == "CLEAR"

    def test_network_error_returns_error(self):
        with patch(
            "app.tools.compliance.sanctions_tools.httpx.get",
            side_effect=Exception("timeout"),
        ):
            result = json.loads(screen_un_sanctions.invoke({"name": "anyone"}))
        assert "error" in result


# ---------------------------------------------------------------------------
# regulatory_feed_tools
# ---------------------------------------------------------------------------

from app.tools.compliance.regulatory_feed_tools import (
    get_regulatory_feed_tools,
    get_regulatory_updates,
    search_regulatory_updates,
)


class TestGetRegulatoryFeedTools:
    def test_returns_two_tools(self):
        tools = get_regulatory_feed_tools()
        assert len(tools) == 2

    def test_tool_names(self):
        names = {t.name for t in get_regulatory_feed_tools()}
        assert names == {"get_regulatory_updates", "search_regulatory_updates"}


_SAMPLE_RSS = b"""<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>SEC Press Releases</title>
    <item>
      <title>SEC Charges XYZ Corp with AML violations</title>
      <pubDate>Mon, 01 Jan 2025 12:00:00 GMT</pubDate>
      <link>https://sec.gov/news/1</link>
      <description>The Securities and Exchange Commission today charged XYZ Corp.</description>
    </item>
    <item>
      <title>SEC Proposes new climate disclosure rules</title>
      <pubDate>Tue, 02 Jan 2025 12:00:00 GMT</pubDate>
      <link>https://sec.gov/news/2</link>
      <description>Proposed rules for climate risk disclosures by public companies.</description>
    </item>
  </channel>
</rss>"""


def _make_rss_response():
    mock_resp = MagicMock()
    mock_resp.content = _SAMPLE_RSS
    mock_resp.raise_for_status = MagicMock()
    return mock_resp


class TestGetRegulatoryUpdates:
    def test_returns_items(self):
        with patch(
            "app.tools.compliance.regulatory_feed_tools.httpx.get",
            return_value=_make_rss_response(),
        ):
            result = json.loads(
                get_regulatory_updates.invoke(
                    {"regulators": "sec_press", "limit_per_feed": 3}
                )
            )
        assert "items" in result
        assert len(result["items"]) > 0

    def test_item_fields_present(self):
        with patch(
            "app.tools.compliance.regulatory_feed_tools.httpx.get",
            return_value=_make_rss_response(),
        ):
            result = json.loads(
                get_regulatory_updates.invoke(
                    {"regulators": "sec_press", "limit_per_feed": 3}
                )
            )
        item = result["items"][0]
        assert "title" in item
        assert "source" in item
        assert "link" in item

    def test_unknown_regulator_returns_error(self):
        result = json.loads(
            get_regulatory_updates.invoke(
                {"regulators": "nonexistent", "limit_per_feed": 3}
            )
        )
        assert "error" in result

    def test_network_error_returns_error_item(self):
        with patch(
            "app.tools.compliance.regulatory_feed_tools.httpx.get",
            side_effect=Exception("timeout"),
        ):
            result = json.loads(
                get_regulatory_updates.invoke(
                    {"regulators": "sec_press", "limit_per_feed": 3}
                )
            )
        assert result["items"][0].get("error") is not None


class TestSearchRegulatoryUpdates:
    def test_keyword_match(self):
        with patch(
            "app.tools.compliance.regulatory_feed_tools.httpx.get",
            return_value=_make_rss_response(),
        ):
            result = json.loads(
                search_regulatory_updates.invoke(
                    {"keyword": "AML", "regulators": "sec_press"}
                )
            )
        assert result["keyword"] == "AML"
        assert len(result["matches"]) >= 1

    def test_no_match(self):
        with patch(
            "app.tools.compliance.regulatory_feed_tools.httpx.get",
            return_value=_make_rss_response(),
        ):
            result = json.loads(
                search_regulatory_updates.invoke(
                    {"keyword": "quantum computing", "regulators": "sec_press"}
                )
            )
        assert result["matches"] == []

    def test_case_insensitive(self):
        with patch(
            "app.tools.compliance.regulatory_feed_tools.httpx.get",
            return_value=_make_rss_response(),
        ):
            result_upper = json.loads(
                search_regulatory_updates.invoke(
                    {"keyword": "AML", "regulators": "sec_press"}
                )
            )
            result_lower = json.loads(
                search_regulatory_updates.invoke(
                    {"keyword": "aml", "regulators": "sec_press"}
                )
            )
        assert len(result_upper["matches"]) == len(result_lower["matches"])
