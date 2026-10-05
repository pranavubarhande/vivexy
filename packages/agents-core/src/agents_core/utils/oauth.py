from authlib.integrations.flask_client import OAuth

oauth = OAuth()


def init_oauth(app) -> None:
    """Register the Google and Microsoft OIDC clients with Authlib.

    Must run inside create_app(), after app.config is populated from
    Config — client registration reads GOOGLE_CLIENT_ID/SECRET and
    MICROSOFT_CLIENT_ID/SECRET/TENANT from app.config.
    """
    oauth.init_app(app)

    oauth.register(
        name="google",
        server_metadata_url=(
            "https://accounts.google.com/.well-known/openid-configuration"
        ),
        client_id=app.config["GOOGLE_CLIENT_ID"],
        client_secret=app.config["GOOGLE_CLIENT_SECRET"],
        client_kwargs={"scope": "openid email profile"},
    )

    tenant = app.config.get("MICROSOFT_TENANT", "common")
    oauth.register(
        name="microsoft",
        server_metadata_url=(
            f"https://login.microsoftonline.com/{tenant}/v2.0/"
            ".well-known/openid-configuration"
        ),
        client_id=app.config["MICROSOFT_CLIENT_ID"],
        client_secret=app.config["MICROSOFT_CLIENT_SECRET"],
        client_kwargs={"scope": "openid email profile"},
    )
