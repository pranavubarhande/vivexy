import os

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
