import os
from html import escape

import resend


def _configure_resend() -> None:
    resend.api_key = os.getenv("RESEND_API_KEY", "")


def send_verification_email(to_email: str, verification_url: str) -> None:
    """Send the email-verification link via Resend."""
    _configure_resend()
    resend.Emails.send(
        {
            "from": os.getenv("RESEND_FROM_EMAIL", "Vivexy <noreply@vivexy.app>"),
            "to": [to_email],
            "subject": "Verify your email address",
            "html": (
                "<p>Click the link below to verify your email address:</p>"
                f'<p><a href="{verification_url}">{verification_url}</a></p>'
                "<p>This link expires in 24 hours.</p>"
            ),
        }
    )


def _send(to_emails, subject: str, html: str) -> None:
    _configure_resend()
    resend.Emails.send(
        {
            "from": os.getenv("RESEND_FROM_EMAIL", "Vivexy <noreply@vivexy.app>"),
            "to": list(to_emails),
            "subject": subject,
            "html": html,
        }
    )


def send_team_invite_email(to_email: str, team_name: str, invite_url: str) -> None:
    _send(
        [to_email],
        f"You've been invited to join {escape(team_name)}",
        (
            f"<p>You've been invited to join <strong>{escape(team_name)}</strong>."
            "</p>"
            f'<p><a href="{invite_url}">Accept the invite</a></p>'
            "<p>Sign up or log in with this email address to join. "
            "The invite expires in 7 days.</p>"
        ),
    )


def send_budget_alert_email(
    to_emails, team_name: str, threshold: int, spent: float, budget: float
) -> None:
    _send(
        to_emails,
        f"{escape(team_name)} has used {threshold}% of its monthly budget",
        (
            f"<p><strong>{escape(team_name)}</strong> has spent "
            f"${spent:,.2f} of its ${budget:,.2f} monthly AI budget "
            f"({threshold}%).</p>"
            "<p>You can review usage or change the budget in the admin panel.</p>"
        ),
    )


def send_platform_alert_email(to_emails, subject: str, lines) -> None:
    items = "".join(f"<li>{escape(line)}</li>" for line in lines)
    _send(to_emails, escape(subject), f"<ul>{items}</ul>")
