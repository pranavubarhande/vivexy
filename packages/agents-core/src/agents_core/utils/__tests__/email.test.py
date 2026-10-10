from unittest.mock import MagicMock, patch


@patch("agents_core.utils.email.resend")
def test_send_verification_email(mock_resend, monkeypatch):
    from agents_core.utils.email import send_verification_email

    monkeypatch.setenv("RESEND_API_KEY", "test-key")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "Vivexy <noreply@vivexy.app>")
    mock_resend.Emails.send = MagicMock()

    send_verification_email("user@example.com", "https://app.vivexy.com/verify-email?token=abc")

    assert mock_resend.api_key == "test-key"
    mock_resend.Emails.send.assert_called_once()
    call_args = mock_resend.Emails.send.call_args[0][0]
    assert call_args["to"] == ["user@example.com"]
    assert call_args["from"] == "Vivexy <noreply@vivexy.app>"
    assert "https://app.vivexy.com/verify-email?token=abc" in call_args["html"]
