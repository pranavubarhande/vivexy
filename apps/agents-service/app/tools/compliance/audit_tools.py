"""
Audit management tools — finding lifecycle, evidence tracking, risk scoring.
These tools operate on structured data provided by the agent/user;
they don't require an external system connection.
"""

import json
from datetime import date, timedelta
from typing import List

from langchain_core.tools import BaseTool, tool


@tool
def calculate_risk_score(
    likelihood: int,
    impact: int,
    control_effectiveness: int,
) -> str:
    """Calculate inherent and residual risk scores using a standard risk matrix.
    Args:
        likelihood: Likelihood of risk occurring (1=Rare, 2=Unlikely, 3=Possible, 4=Likely, 5=Almost certain)
        impact: Impact if risk occurs (1=Negligible, 2=Minor, 3=Moderate, 4=Major, 5=Catastrophic)
        control_effectiveness: How effective existing controls are (1=Ineffective, 2=Weak, 3=Moderate, 4=Strong, 5=Very strong)
    """
    if not all(1 <= x <= 5 for x in [likelihood, impact, control_effectiveness]):
        return json.dumps({"error": "All inputs must be between 1 and 5"})

    inherent = likelihood * impact
    control_reduction = (control_effectiveness - 1) * 0.2
    residual = round(inherent * (1 - control_reduction))

    def rating(score: int) -> str:
        if score >= 20:
            return "CRITICAL"
        if score >= 12:
            return "HIGH"
        if score >= 6:
            return "MEDIUM"
        return "LOW"

    return json.dumps(
        {
            "inherent_score": inherent,
            "inherent_rating": rating(inherent),
            "residual_score": residual,
            "residual_rating": rating(residual),
            "control_effectiveness": control_effectiveness,
            "recommendation": (
                "Immediate remediation required"
                if residual >= 20
                else (
                    "Priority remediation within 30 days"
                    if residual >= 12
                    else (
                        "Address within 90 days"
                        if residual >= 6
                        else "Monitor; accept residual risk"
                    )
                )
            ),
        }
    )


@tool
def generate_finding_summary(
    title: str,
    description: str,
    risk_rating: str,
    owner: str,
    due_date: str,
) -> str:
    """Generate a structured audit finding summary in standard format.
    Args:
        title: Short title for the finding
        description: Detailed description of the control failure or gap
        risk_rating: Risk rating (LOW, MEDIUM, HIGH, CRITICAL)
        owner: Name/team responsible for remediation
        due_date: Target remediation date (YYYY-MM-DD)
    """
    rating_upper = risk_rating.upper()
    valid_ratings = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
    if rating_upper not in valid_ratings:
        return json.dumps(
            {"error": f"Invalid risk_rating. Use one of: {', '.join(valid_ratings)}"}
        )

    try:
        due = date.fromisoformat(due_date)
        days_remaining = (due - date.today()).days
        overdue = days_remaining < 0
    except ValueError:
        return json.dumps({"error": "Invalid due_date format. Use YYYY-MM-DD"})

    return json.dumps(
        {
            "finding": {
                "title": title,
                "description": description,
                "risk_rating": rating_upper,
                "owner": owner,
                "due_date": due_date,
                "days_remaining": days_remaining,
                "status": "OVERDUE" if overdue else "OPEN",
            },
            "escalation_required": overdue or rating_upper in {"HIGH", "CRITICAL"},
            "suggested_evidence": [
                "Policy or procedure document relevant to the control",
                "Evidence of control operation (screenshots, logs, approvals)",
                "Root cause analysis documentation",
                "Remediation plan with milestones",
            ],
        }
    )


@tool
def track_remediation_deadlines(findings_json: str) -> str:
    """Analyse a list of audit findings and identify overdue or at-risk items.
    Args:
        findings_json: JSON array of findings, each with 'title', 'due_date' (YYYY-MM-DD), 'risk_rating', 'owner'
    """
    try:
        findings = json.loads(findings_json)
    except json.JSONDecodeError:
        return json.dumps({"error": "Invalid JSON input"})

    today = date.today()
    summary = {"overdue": [], "due_within_30_days": [], "on_track": []}

    for f in findings:
        try:
            due = date.fromisoformat(f.get("due_date", ""))
            days = (due - today).days
            item = {**f, "days_remaining": days}
            if days < 0:
                summary["overdue"].append(item)
            elif days <= 30:
                summary["due_within_30_days"].append(item)
            else:
                summary["on_track"].append(item)
        except (ValueError, TypeError):
            continue

    return json.dumps(
        {
            "as_of": today.isoformat(),
            "total_findings": len(findings),
            "overdue_count": len(summary["overdue"]),
            "at_risk_count": len(summary["due_within_30_days"]),
            "on_track_count": len(summary["on_track"]),
            **summary,
        }
    )


def get_audit_tools() -> List[BaseTool]:
    return [calculate_risk_score, generate_finding_summary, track_remediation_deadlines]
