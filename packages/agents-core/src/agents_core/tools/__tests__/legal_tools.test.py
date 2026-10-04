"""
Tests for legal domain tools:
  - contract_tools: pure computation (clause detection, metadata extraction)
  - legal_db_tools: mocked HTTP (CourtListener, USPTO Patents)
  - legal_research_tools: format_legal_citation (pure), mocked HTTP (govinfo)
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from agents_core.tools.legal.contract_tools import (
    analyze_contract_clauses,
    extract_contract_metadata,
    get_contract_tools,
)

# ---------------------------------------------------------------------------
# contract_tools
# ---------------------------------------------------------------------------


class TestGetContractTools:
    def test_returns_two_tools(self):
        tools = get_contract_tools()
        assert len(tools) == 2

    def test_tool_names(self):
        names = {t.name for t in get_contract_tools()}
        assert names == {"analyze_contract_clauses", "extract_contract_metadata"}


_FULL_CONTRACT = """
MUTUAL NON-DISCLOSURE AGREEMENT

This Agreement is entered into between Acme Corp and Beta Ltd,
effective as of January 15, 2025.

Term of Agreement: initial term of 2 years.

1. Confidentiality
   Each party agrees to maintain the confidentiality of the other party's information.
   This obligation of confidentiality is perpetual and irrevocable.

2. Indemnification
   Each party shall indemnify the other party against third party claims arising from breach.

3. Limitation of Liability
   IN NO EVENT SHALL EITHER PARTY'S LIABILITY EXCEED THE FEES PAID IN THE PRIOR 12 MONTHS.

4. Governing Law
   This Agreement shall be governed by the laws of Delaware.

5. Dispute Resolution
   Any disputes shall be resolved by binding arbitration.

6. Termination
   Either party may terminate this Agreement with 30 days notice period of 30 days.

7. Intellectual Property
   Each party retains ownership of its intellectual property.

8. Warranties
   Each party warrants that it has authority to enter into this Agreement.

9. Payment Terms
   Invoices due net 30 days.

10. Force Majeure
    Neither party shall be liable for events beyond its reasonable control.

11. Assignment
    This Agreement may not be assigned without written consent.

12. Entire Agreement
    This Agreement constitutes the entire agreement between the parties.
"""

_MINIMAL_CONTRACT = "This is a very short document with no legal clauses."


class TestAnalyzeContractClauses:
    def test_identifies_present_clauses(self):
        result = json.loads(
            analyze_contract_clauses.invoke({"contract_text": _FULL_CONTRACT})
        )
        assert "indemnification" in result["present_clauses"]
        assert "limitation of liability" in result["present_clauses"]
        assert "governing law" in result["present_clauses"]
        assert "confidentiality" in result["present_clauses"]

    def test_identifies_missing_clauses(self):
        result = json.loads(
            analyze_contract_clauses.invoke({"contract_text": _MINIMAL_CONTRACT})
        )
        assert len(result["missing_clauses"]) == len(result["present_clauses"]) + len(
            result["missing_clauses"]
        )
        assert result["risk_score"] == "LOW"

    def test_flags_high_risk_patterns(self):
        result = json.loads(
            analyze_contract_clauses.invoke({"contract_text": _FULL_CONTRACT})
        )
        severities = [r["severity"] for r in result["flagged_risks"]]
        # perpetual/irrevocable and third-party indemnification are both flagged
        assert "MEDIUM" in severities or "HIGH" in severities

    def test_risk_score_escalates_with_high_risks(self):
        high_risk_text = """
        unlimited liability for all claims.
        unilateral right to modify all terms at any time.
        indemnify against all third party claims worldwide.
        """
        result = json.loads(
            analyze_contract_clauses.invoke({"contract_text": high_risk_text})
        )
        assert result["risk_score"] == "HIGH"

    def test_low_risk_score_for_minimal_text(self):
        result = json.loads(
            analyze_contract_clauses.invoke({"contract_text": _MINIMAL_CONTRACT})
        )
        assert result["risk_score"] == "LOW"
        assert result["flagged_risks"] == []

    def test_summary_included(self):
        result = json.loads(
            analyze_contract_clauses.invoke({"contract_text": _FULL_CONTRACT})
        )
        assert "summary" in result
        assert len(result["summary"]) > 0

    def test_auto_renewal_flagged_as_low(self):
        text = "This agreement includes automatic renewal unless cancelled with 60 days notice."
        result = json.loads(analyze_contract_clauses.invoke({"contract_text": text}))
        low_risks = [r for r in result["flagged_risks"] if r["severity"] == "LOW"]
        assert len(low_risks) >= 1


class TestExtractContractMetadata:
    def test_extracts_governing_law(self):
        result = json.loads(
            extract_contract_metadata.invoke({"contract_text": _FULL_CONTRACT})
        )
        assert result.get("governing_law") is not None
        assert "Delaware" in result["governing_law"]

    def test_extracts_term(self):
        result = json.loads(
            extract_contract_metadata.invoke({"contract_text": _FULL_CONTRACT})
        )
        assert result.get("term") is not None
        assert "2" in result["term"]

    def test_extracts_notice_period(self):
        result = json.loads(
            extract_contract_metadata.invoke({"contract_text": _FULL_CONTRACT})
        )
        assert result.get("notice_period") is not None
        assert "30" in result["notice_period"]

    def test_extracts_parties(self):
        result = json.loads(
            extract_contract_metadata.invoke({"contract_text": _FULL_CONTRACT})
        )
        assert result.get("party_a") is not None
        assert result.get("party_b") is not None

    def test_minimal_contract_returns_none_fields(self):
        result = json.loads(
            extract_contract_metadata.invoke({"contract_text": _MINIMAL_CONTRACT})
        )
        assert result.get("governing_law") is None
        assert result.get("term") is None

    def test_extracts_effective_date(self):
        result = json.loads(
            extract_contract_metadata.invoke({"contract_text": _FULL_CONTRACT})
        )
        assert result.get("effective_date") is not None


# ---------------------------------------------------------------------------
# legal_db_tools
# ---------------------------------------------------------------------------

from agents_core.tools.legal.legal_db_tools import (
    get_legal_db_tools,
    get_opinion_text,
    search_case_law,
    search_patents,
)


class TestGetLegalDbTools:
    def test_returns_three_tools(self):
        tools = get_legal_db_tools()
        assert len(tools) == 3

    def test_tool_names(self):
        names = {t.name for t in get_legal_db_tools()}
        assert names == {"search_case_law", "get_opinion_text", "search_patents"}

    def test_tools_have_descriptions(self):
        for t in get_legal_db_tools():
            assert t.description


class TestSearchCaseLaw:
    _CL_RESPONSE = {
        "count": 1,
        "results": [
            {
                "caseName": "Smith v. Jones",
                "court": "ca2",
                "dateFiled": "2022-03-15",
                "citation": ["100 F.3d 200"],
                "absolute_url": "/opinion/12345/smith-v-jones/",
                "snippet": "The court held that...",
            }
        ],
    }

    def _mock_response(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = self._CL_RESPONSE
        mock_resp.raise_for_status = MagicMock()
        return mock_resp

    def test_returns_results(self):
        with patch(
            "agents_core.tools.legal.legal_db_tools.httpx.get",
            return_value=self._mock_response(),
        ):
            result = json.loads(
                search_case_law.invoke(
                    {
                        "query": "breach of fiduciary duty",
                        "jurisdiction": "",
                        "after_date": "",
                    }
                )
            )
        assert result["count"] == 1
        assert result["results"][0]["case_name"] == "Smith v. Jones"

    def test_result_fields_present(self):
        with patch(
            "agents_core.tools.legal.legal_db_tools.httpx.get",
            return_value=self._mock_response(),
        ):
            result = json.loads(
                search_case_law.invoke(
                    {"query": "test", "jurisdiction": "", "after_date": ""}
                )
            )
        r = result["results"][0]
        assert "case_name" in r
        assert "court" in r
        assert "url" in r
        assert "snippet" in r

    def test_network_error_returns_error(self):
        with patch(
            "agents_core.tools.legal.legal_db_tools.httpx.get", side_effect=Exception("timeout")
        ):
            result = json.loads(
                search_case_law.invoke(
                    {"query": "test", "jurisdiction": "", "after_date": ""}
                )
            )
        assert "error" in result


class TestGetOpinionText:
    _OPINION_RESPONSE = {
        "plain_text": "The court held that the defendant breached its fiduciary duty...",
        "cluster": {"case_name": "Smith v. Jones"},
    }

    def _mock_response(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = self._OPINION_RESPONSE
        mock_resp.raise_for_status = MagicMock()
        return mock_resp

    def test_returns_text(self):
        with patch(
            "agents_core.tools.legal.legal_db_tools.httpx.get",
            return_value=self._mock_response(),
        ):
            result = json.loads(get_opinion_text.invoke({"opinion_id": "12345"}))
        assert "The court held" in result["text"]
        assert result["case_name"] == "Smith v. Jones"

    def test_network_error_returns_error(self):
        with patch(
            "agents_core.tools.legal.legal_db_tools.httpx.get", side_effect=Exception("timeout")
        ):
            result = json.loads(get_opinion_text.invoke({"opinion_id": "12345"}))
        assert "error" in result


class TestSearchPatents:
    _PATENTS_RESPONSE = {
        "count": 1,
        "patents": [
            {
                "patent_number": "US1234567",
                "patent_title": "Machine learning fraud detection system",
                "patent_date": "2023-06-15",
                "assignees": [{"assignee_organization": "Acme Corp"}],
                "patent_abstract": "A system for detecting fraud using machine learning...",
            }
        ],
    }

    def _mock_response(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = self._PATENTS_RESPONSE
        mock_resp.raise_for_status = MagicMock()
        return mock_resp

    def test_returns_patents(self):
        with patch(
            "agents_core.tools.legal.legal_db_tools.httpx.post",
            return_value=self._mock_response(),
        ):
            result = json.loads(
                search_patents.invoke({"query": "fraud detection", "date_range": ""})
            )
        assert result["count"] == 1
        assert result["results"][0]["number"] == "US1234567"
        assert result["results"][0]["assignee"] == "Acme Corp"

    def test_result_fields_present(self):
        with patch(
            "agents_core.tools.legal.legal_db_tools.httpx.post",
            return_value=self._mock_response(),
        ):
            result = json.loads(
                search_patents.invoke({"query": "test", "date_range": ""})
            )
        r = result["results"][0]
        assert "number" in r
        assert "title" in r
        assert "date" in r
        assert "abstract" in r

    def test_network_error_returns_error(self):
        with patch(
            "agents_core.tools.legal.legal_db_tools.httpx.post",
            side_effect=Exception("timeout"),
        ):
            result = json.loads(
                search_patents.invoke({"query": "test", "date_range": ""})
            )
        assert "error" in result


# ---------------------------------------------------------------------------
# legal_research_tools
# ---------------------------------------------------------------------------

from agents_core.tools.legal.legal_research_tools import (
    format_legal_citation,
    get_legal_research_tools,
    search_cfr,
    search_us_code,
)


class TestGetLegalResearchTools:
    def test_returns_three_tools(self):
        tools = get_legal_research_tools()
        assert len(tools) == 3

    def test_tool_names(self):
        names = {t.name for t in get_legal_research_tools()}
        assert names == {"search_us_code", "format_legal_citation", "search_cfr"}


class TestFormatLegalCitation:
    def test_bluebook_format_with_court(self):
        result = json.loads(
            format_legal_citation.invoke(
                {
                    "case_name": "Smith v. Jones",
                    "reporter": "F.3d",
                    "volume": "100",
                    "page": "200",
                    "year": "2022",
                    "court": "2d Cir.",
                }
            )
        )
        assert result["format"] == "Bluebook"
        assert "Smith v. Jones" in result["citation"]
        assert "100 F.3d 200" in result["citation"]
        assert "2d Cir." in result["citation"]
        assert "2022" in result["citation"]

    def test_supreme_court_no_court_arg(self):
        result = json.loads(
            format_legal_citation.invoke(
                {
                    "case_name": "Marbury v. Madison",
                    "reporter": "U.S.",
                    "volume": "5",
                    "page": "137",
                    "year": "1803",
                    "court": "",
                }
            )
        )
        assert "Marbury v. Madison" in result["citation"]
        assert "5 U.S. 137" in result["citation"]

    def test_citation_ends_with_period(self):
        result = json.loads(
            format_legal_citation.invoke(
                {
                    "case_name": "A v. B",
                    "reporter": "F.2d",
                    "volume": "1",
                    "page": "1",
                    "year": "2000",
                    "court": "9th Cir.",
                }
            )
        )
        assert result["citation"].endswith(".")


class TestSearchUsCode:
    _GOVINFO_RESPONSE = {
        "count": 1,
        "results": [
            {
                "title": "Securities Exchange Act Section 10(b)",
                "granuleId": "USCODE-2023-title15-chap2B-sec78j",
                "dateIssued": "2023-01-01",
                "download": {
                    "pdfLink": "https://api.govinfo.gov/packages/USCODE-2023/pdf"
                },
            }
        ],
    }

    def _mock_response(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = self._GOVINFO_RESPONSE
        mock_resp.raise_for_status = MagicMock()
        return mock_resp

    def test_returns_results(self):
        with patch(
            "agents_core.tools.legal.legal_research_tools.httpx.get",
            return_value=self._mock_response(),
        ):
            result = json.loads(
                search_us_code.invoke({"query": "insider trading", "title": "15"})
            )
        assert result["count"] == 1
        assert result["results"][0]["title"] == "Securities Exchange Act Section 10(b)"

    def test_result_fields_present(self):
        with patch(
            "agents_core.tools.legal.legal_research_tools.httpx.get",
            return_value=self._mock_response(),
        ):
            result = json.loads(search_us_code.invoke({"query": "test", "title": ""}))
        r = result["results"][0]
        assert "title" in r
        assert "citation" in r
        assert "url" in r

    def test_network_error_returns_error(self):
        with patch(
            "agents_core.tools.legal.legal_research_tools.httpx.get",
            side_effect=Exception("timeout"),
        ):
            result = json.loads(search_us_code.invoke({"query": "test", "title": ""}))
        assert "error" in result


class TestSearchCfr:
    _CFR_RESPONSE = {
        "count": 2,
        "results": [
            {
                "title": "17 CFR Part 240 - Securities Exchange Act Rules",
                "granuleId": "CFR-2024-title17-vol3-part240",
                "dateIssued": "2024-01-01",
            },
            {
                "title": "17 CFR Part 275 - Investment Advisers Act Rules",
                "granuleId": "CFR-2024-title17-vol4-part275",
                "dateIssued": "2024-01-01",
            },
        ],
    }

    def _mock_response(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = self._CFR_RESPONSE
        mock_resp.raise_for_status = MagicMock()
        return mock_resp

    def test_returns_results(self):
        with patch(
            "agents_core.tools.legal.legal_research_tools.httpx.get",
            return_value=self._mock_response(),
        ):
            result = json.loads(
                search_cfr.invoke({"query": "beneficial ownership", "title": "17"})
            )
        assert result["count"] == 2
        assert len(result["results"]) == 2

    def test_network_error_returns_error(self):
        with patch(
            "agents_core.tools.legal.legal_research_tools.httpx.get",
            side_effect=Exception("timeout"),
        ):
            result = json.loads(search_cfr.invoke({"query": "test", "title": ""}))
        assert "error" in result
