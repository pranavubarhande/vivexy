from authlib.integrations.flask_client import OAuth

oauth = OAuth()

_OAUTH_CLIENT_NAMES = ("google", "microsoft")


def init_oauth(app) -> None:
    """Register the Google and Microsoft OIDC clients with Authlib.

    Must run inside create_app(), after app.config is populated from
    Config — client registration reads GOOGLE_CLIENT_ID/SECRET and
    MICROSOFT_CLIENT_ID/SECRET/TENANT from app.config.

    Authlib's BaseOAuth.register() builds and caches the client object
    immediately (in oauth._clients), not lazily on first use — so if this
    function is ever called more than once in the same process (e.g. a
    test suite that boots create_app() multiple times, or any code path
    that constructs the app factory twice), a second register() call for
    the same name would silently hand back the FIRST call's cached client
    instead of rebuilding from this call's app.config, serving stale (or
    wrong-app) credentials with no error. Authlib has no public API to
    deregister/reset a client, so this clears the private _clients cache
    for exactly the two names this function manages before re-registering,
    making init_oauth() safe to call repeatedly.
    """
    oauth.init_app(app)
    for name in _OAUTH_CLIENT_NAMES:
        oauth._clients.pop(name, None)

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
