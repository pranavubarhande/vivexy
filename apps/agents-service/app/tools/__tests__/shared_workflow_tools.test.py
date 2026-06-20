"""
Tests for shared workflow tools:
  - calculate_regulatory_deadline: pure computation (date arithmetic)
  - structure_approval_request: pure computation (routing logic)
  - send_workflow_notification: mocked webhook
"""

import json
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest

from app.tools.shared.workflow_tools import (
    calculate_regulatory_deadline,
    get_workflow_tools,
    send_workflow_notification,
    structure_approval_request,
)

# ---------------------------------------------------------------------------
# Tool registration
# ---------------------------------------------------------------------------


class TestGetWorkflowTools:
    def test_returns_three_tools(self):
        tools = get_workflow_tools()
        assert len(tools) == 3

    def test_tool_names(self):
        names = {t.name for t in get_workflow_tools()}
        assert names == {
            "calculate_regulatory_deadline",
            "structure_approval_request",
            "send_workflow_notification",
        }

    def test_tools_have_descriptions(self):
        for t in get_workflow_tools():
            assert t.description


# ---------------------------------------------------------------------------
# calculate_regulatory_deadline
# ---------------------------------------------------------------------------


class TestCalculateRegulatoryDeadline:
    def test_gdpr_breach_72_hours(self):
        result = json.loads(
            calculate_regulatory_deadline.invoke(
                {
                    "trigger_date": "2025-01-01",
                    "regulation": "GDPR_BREACH",
                }
            )
        )
        assert result["deadline"] == "2025-01-04"  # 72h = 3 days
        assert "72 hours" in result["description"]
        assert result["regulation"] == "GDPR_BREACH"

    def test_sec_8k_four_business_days(self):
        # Trigger on Wednesday 2025-01-01 → 4 business days → Mon 2025-01-07
        # (Thu Jan 2, Fri Jan 3, Mon Jan 6, Tue Jan 7)
        result = json.loads(
            calculate_regulatory_deadline.invoke(
                {
                    "trigger_date": "2025-01-01",
                    "regulation": "SEC_8K",
                }
            )
        )
        assert result["deadline"] == "2025-01-07"
        assert "business days" in result["description"]

    def test_hipaa_breach_60_days(self):
        result = json.loads(
            calculate_regulatory_deadline.invoke(
                {
                    "trigger_date": "2025-01-01",
                    "regulation": "HIPAA_BREACH",
                }
            )
        )
        expected = (date(2025, 1, 1) + timedelta(days=60)).isoformat()
        assert result["deadline"] == expected

    def test_ccpa_breach_45_days(self):
        result = json.loads(
            calculate_regulatory_deadline.invoke(
                {
                    "trigger_date": "2025-01-01",
                    "regulation": "CCPA_BREACH",
                }
            )
        )
        expected = (date(2025, 1, 1) + timedelta(days=45)).isoformat()
        assert result["deadline"] == expected

    def test_pci_dss_24_hours(self):
        result = json.loads(
            calculate_regulatory_deadline.invoke(
                {
                    "trigger_date": "2025-06-01",
                    "regulation": "PCI_DSS",
                }
            )
        )
        assert result["deadline"] == "2025-06-02"

    def test_fca_breach_72_hours(self):
        result = json.loads(
            calculate_regulatory_deadline.invoke(
                {
                    "trigger_date": "2025-06-01",
                    "regulation": "FCA_BREACH",
                }
            )
        )
        assert result["deadline"] == "2025-06-04"

    def test_unknown_regulation_returns_error(self):
        result = json.loads(
            calculate_regulatory_deadline.invoke(
                {
                    "trigger_date": "2025-01-01",
                    "regulation": "MADE_UP_REG",
                }
            )
        )
        assert "error" in result

    def test_invalid_date_format_returns_error(self):
        result = json.loads(
            calculate_regulatory_deadline.invoke(
                {
                    "trigger_date": "01/01/2025",
                    "regulation": "GDPR_BREACH",
                }
            )
        )
        assert "error" in result

    def test_days_remaining_field_present(self):
        result = json.loads(
            calculate_regulatory_deadline.invoke(
                {
                    "trigger_date": "2025-01-01",
                    "regulation": "GDPR_BREACH",
                }
            )
        )
        assert "days_remaining" in result
        assert isinstance(result["days_remaining"], int)

    def test_overdue_field_present(self):
        result = json.loads(
            calculate_regulatory_deadline.invoke(
                {
                    "trigger_date": "2025-01-01",
                    "regulation": "GDPR_BREACH",
                }
            )
        )
        assert "overdue" in result
        assert isinstance(result["overdue"], bool)

    def test_regulation_case_insensitive(self):
        result = json.loads(
            calculate_regulatory_deadline.invoke(
                {
                    "trigger_date": "2025-01-01",
                    "regulation": "gdpr_breach",
                }
            )
        )
        assert result["deadline"] == "2025-01-04"


# ---------------------------------------------------------------------------
# structure_approval_request
# ---------------------------------------------------------------------------


class TestStructureApprovalRequest:
    def test_contract_deviation_routing(self):
        result = json.loads(
            structure_approval_request.invoke(
                {
                    "request_type": "CONTRACT_DEVIATION",
                    "description": "Requesting removal of liability cap clause",
                    "requestor": "Sales Team",
                    "amount": "$2M",
                    "priority": "HIGH",
                }
            )
        )
        assert "Legal Counsel" in result["routing"]["suggested_approvers"]
        assert result["routing"]["sla_hours"] == 8
        assert result["request"]["type"] == "CONTRACT_DEVIATION"

    def test_spend_routing(self):
        result = json.loads(
            structure_approval_request.invoke(
                {
                    "request_type": "SPEND",
                    "description": "New software license purchase",
                    "requestor": "Engineering",
                    "amount": "$150,000",
                    "priority": "NORMAL",
                }
            )
        )
        assert "Finance BP" in result["routing"]["suggested_approvers"]
        assert result["routing"]["sla_hours"] == 24

    def test_exception_routing(self):
        result = json.loads(
            structure_approval_request.invoke(
                {
                    "request_type": "EXCEPTION",
                    "description": "Requesting policy exception for third-party data sharing",
                    "requestor": "Product Team",
                    "amount": "",
                    "priority": "URGENT",
                }
            )
        )
        assert "Risk & Compliance" in result["routing"]["suggested_approvers"]
        assert result["routing"]["sla_hours"] == 2

    def test_policy_change_routing(self):
        result = json.loads(
            structure_approval_request.invoke(
                {
                    "request_type": "POLICY_CHANGE",
                    "description": "Update travel expense policy limit",
                    "requestor": "Finance",
                    "amount": "",
                    "priority": "LOW",
                }
            )
        )
        assert "HR" in result["routing"]["suggested_approvers"]
        assert result["routing"]["sla_hours"] == 72

    def test_unknown_type_uses_default_routing(self):
        result = json.loads(
            structure_approval_request.invoke(
                {
                    "request_type": "CUSTOM_TYPE",
                    "description": "Something unusual",
                    "requestor": "Someone",
                    "amount": "",
                    "priority": "NORMAL",
                }
            )
        )
        assert len(result["routing"]["suggested_approvers"]) > 0

    def test_priority_case_insensitive(self):
        result = json.loads(
            structure_approval_request.invoke(
                {
                    "request_type": "SPEND",
                    "description": "Test",
                    "requestor": "Test",
                    "amount": "",
                    "priority": "urgent",
                }
            )
        )
        assert result["routing"]["sla_hours"] == 2

    def test_next_steps_present(self):
        result = json.loads(
            structure_approval_request.invoke(
                {
                    "request_type": "SPEND",
                    "description": "Test",
                    "requestor": "Test",
                    "amount": "",
                    "priority": "NORMAL",
                }
            )
        )
        assert len(result["next_steps"]) > 0

    def test_deadline_field_present(self):
        result = json.loads(
            structure_approval_request.invoke(
                {
                    "request_type": "SPEND",
                    "description": "Test",
                    "requestor": "Test",
                    "amount": "$5000",
                    "priority": "HIGH",
                }
            )
        )
        assert "deadline" in result["routing"]


# ---------------------------------------------------------------------------
# send_workflow_notification
# ---------------------------------------------------------------------------


class TestSendWorkflowNotification:
    def test_skipped_when_no_webhook_configured(self):
        with patch("app.tools.shared.workflow_tools._WEBHOOK_URL", ""):
            result = json.loads(
                send_workflow_notification.invoke(
                    {
                        "title": "Alert",
                        "message": "Something happened",
                        "priority": "high",
                    }
                )
            )
        assert result["status"] == "skipped"
        assert "WORKFLOW_WEBHOOK_URL" in result["reason"]
        # Notification payload is still returned for logging purposes
        assert result["notification"]["title"] == "Alert"
        assert result["notification"]["priority"] == "high"

    def test_sends_when_webhook_configured(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        with (
            patch(
                "app.tools.shared.workflow_tools._WEBHOOK_URL",
                "https://hooks.example.com/notify",
            ),
            patch(
                "app.tools.shared.workflow_tools.httpx.post", return_value=mock_resp
            ) as mock_post,
        ):
            result = json.loads(
                send_workflow_notification.invoke(
                    {
                        "title": "Contract Expiry Alert",
                        "message": "NDA with Acme Corp expires in 30 days",
                        "priority": "normal",
                    }
                )
            )
        assert result["status"] == "sent"
        assert result["response_status"] == 200
        mock_post.assert_called_once()
        call_json = mock_post.call_args[1]["json"]
        assert call_json["title"] == "Contract Expiry Alert"

    def test_network_error_returns_failed_status(self):
        with (
            patch(
                "app.tools.shared.workflow_tools._WEBHOOK_URL",
                "https://hooks.example.com/notify",
            ),
            patch(
                "app.tools.shared.workflow_tools.httpx.post",
                side_effect=Exception("connection refused"),
            ),
        ):
            result = json.loads(
                send_workflow_notification.invoke(
                    {
                        "title": "Test",
                        "message": "Test",
                        "priority": "low",
                    }
                )
            )
        assert result["status"] == "failed"
        assert "error" in result
