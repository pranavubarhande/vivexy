"""
Workflow tools — deadline tracking, approval routing logic, task structuring.
These are computation tools that don't require external system connections.
For real approval routing, wire into your notification/email system via env config.
"""

import json
import os
from datetime import date, datetime, timedelta
from typing import List

import httpx
from langchain_core.tools import BaseTool, tool

_WEBHOOK_URL = os.getenv("WORKFLOW_WEBHOOK_URL", "")


@tool
def calculate_regulatory_deadline(trigger_date: str, regulation: str) -> str:
    """Calculate regulatory notification deadlines from a trigger event date.
    Args:
        trigger_date: Date the trigger event occurred (YYYY-MM-DD)
        regulation: Regulation name (GDPR_BREACH, SEC_8K, PCI_DSS, HIPAA_BREACH, CCPA_BREACH)
    """
    deadlines = {
        "GDPR_BREACH": {
            "hours": 72,
            "description": "GDPR Article 33 — notify supervisory authority within 72 hours",
        },
        "SEC_8K": {
            "business_days": 4,
            "description": "SEC Rule 13a-11 — file 8-K within 4 business days of material event",
        },
        "PCI_DSS": {
            "hours": 24,
            "description": "PCI DSS — notify card brands within 24 hours of confirmed breach",
        },
        "HIPAA_BREACH": {
            "days": 60,
            "description": "HIPAA Breach Rule — notify HHS within 60 days of discovery",
        },
        "CCPA_BREACH": {
            "description": "CCPA — notify affected consumers in 'most expedient time possible'",
            "days": 45,
        },
        "FCA_BREACH": {
            "hours": 72,
            "description": "FCA SYSC 15A — notify FCA within 72 hours of major incident",
        },
    }

    reg_upper = regulation.upper()
    if reg_upper not in deadlines:
        return json.dumps(
            {"error": f"Unknown regulation. Options: {', '.join(deadlines.keys())}"}
        )

    try:
        trigger = date.fromisoformat(trigger_date)
    except ValueError:
        return json.dumps({"error": "Invalid trigger_date format. Use YYYY-MM-DD"})

    rule = deadlines[reg_upper]
    if "hours" in rule:
        deadline_dt = datetime.combine(trigger, datetime.min.time()) + timedelta(
            hours=rule["hours"]
        )
        deadline = deadline_dt.date()
    elif "business_days" in rule:
        bd = rule["business_days"]
        d = trigger
        while bd > 0:
            d += timedelta(days=1)
            if d.weekday() < 5:
                bd -= 1
        deadline = d
    else:
        deadline = trigger + timedelta(days=rule.get("days", 30))

    days_remaining = (deadline - date.today()).days
    return json.dumps(
        {
            "regulation": reg_upper,
            "trigger_date": trigger_date,
            "deadline": deadline.isoformat(),
            "days_remaining": days_remaining,
            "overdue": days_remaining < 0,
            "description": rule["description"],
        }
    )


@tool
def structure_approval_request(
    request_type: str,
    description: str,
    requestor: str,
    amount: str = "",
    priority: str = "NORMAL",
) -> str:
    """Structure an approval request with routing guidance based on type and amount.
    Args:
        request_type: Type of approval needed (CONTRACT_DEVIATION, SPEND, EXCEPTION, POLICY_CHANGE)
        description: What is being requested and why
        requestor: Name or team making the request
        amount: Optional monetary amount (e.g. '$50,000') for spend approvals
        priority: Priority level (LOW, NORMAL, HIGH, URGENT)
    """
    routing_map = {
        "CONTRACT_DEVIATION": ["Legal Counsel", "Business Owner", "CFO (if >$1M)"],
        "SPEND": ["Direct Manager", "Finance BP", "CFO (if >$100K)"],
        "EXCEPTION": ["Risk & Compliance", "Business Owner", "Legal (if regulatory)"],
        "POLICY_CHANGE": ["Policy Owner", "HR", "Legal", "Executive Sponsor"],
    }

    req_upper = request_type.upper()
    approvers = routing_map.get(req_upper, ["Business Owner", "Legal", "Finance"])

    sla_hours = {"LOW": 72, "NORMAL": 24, "HIGH": 8, "URGENT": 2}.get(
        priority.upper(), 24
    )

    return json.dumps(
        {
            "request": {
                "type": req_upper,
                "description": description,
                "requestor": requestor,
                "amount": amount,
                "priority": priority.upper(),
            },
            "routing": {
                "suggested_approvers": approvers,
                "sla_hours": sla_hours,
                "deadline": (datetime.now() + timedelta(hours=sla_hours)).strftime(
                    "%Y-%m-%d %H:%M"
                ),
            },
            "next_steps": [
                f"Send to: {', '.join(approvers)}",
                f"SLA: {sla_hours} hours ({priority.upper()} priority)",
                "Attach supporting documentation before routing",
                "Track in your approval/ticketing system",
            ],
        }
    )


@tool
def send_workflow_notification(
    title: str, message: str, priority: str = "normal"
) -> str:
    """Send a workflow notification via webhook (if WORKFLOW_WEBHOOK_URL is configured).
    Args:
        title: Notification title
        message: Notification message body
        priority: Priority level (low, normal, high, urgent)
    """
    if not _WEBHOOK_URL:
        return json.dumps(
            {
                "status": "skipped",
                "reason": "WORKFLOW_WEBHOOK_URL not configured",
                "notification": {
                    "title": title,
                    "message": message,
                    "priority": priority,
                },
            }
        )
    try:
        payload = {"title": title, "message": message, "priority": priority}
        resp = httpx.post(_WEBHOOK_URL, json=payload, timeout=10)
        resp.raise_for_status()
        return json.dumps({"status": "sent", "response_status": resp.status_code})
    except Exception as e:
        return json.dumps({"status": "failed", "error": str(e)})


def get_workflow_tools() -> List[BaseTool]:
    return [
        calculate_regulatory_deadline,
        structure_approval_request,
        send_workflow_notification,
    ]
