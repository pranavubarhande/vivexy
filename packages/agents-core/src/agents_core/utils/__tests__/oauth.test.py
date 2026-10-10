from flask import Flask

from agents_core.utils.oauth import init_oauth, oauth


def _make_app(google_client_id: str) -> Flask:
    app = Flask(__name__)
    app.config["SECRET_KEY"] = "test-secret"
    app.config["GOOGLE_CLIENT_ID"] = google_client_id
    app.config["GOOGLE_CLIENT_SECRET"] = "google-secret"
    app.config["MICROSOFT_CLIENT_ID"] = "ms-client"
    app.config["MICROSOFT_CLIENT_SECRET"] = "ms-secret"
    app.config["MICROSOFT_TENANT"] = "common"
    return app


def test_init_oauth_registers_both_providers():
    app = _make_app("google-client-1")
    with app.app_context():
        init_oauth(app)
        assert oauth.create_client("google") is not None
        assert oauth.create_client("microsoft") is not None


def test_init_oauth_is_safe_to_call_twice_with_different_config():
    """Authlib's register() caches the client object on first call and
    never rebuilds it — without clearing oauth._clients first, a second
    init_oauth() call would silently keep serving the FIRST app's
    credentials. This must not happen."""
    first_app = _make_app("google-client-1")
    with first_app.app_context():
        init_oauth(first_app)
        first_client = oauth.create_client("google")
        assert first_client.client_id == "google-client-1"

    second_app = _make_app("google-client-2")
    with second_app.app_context():
        init_oauth(second_app)
        second_client = oauth.create_client("google")
        assert second_client.client_id == "google-client-2"
