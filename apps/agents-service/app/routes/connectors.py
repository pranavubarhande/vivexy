from composio import Composio
from flask import Blueprint, jsonify, request

from app.middlewares.auth import auth_middleware

bp = Blueprint("connectors", __name__, url_prefix="/api/connectors")


@bp.route("/active", methods=["GET"])
@auth_middleware
def list_active_connectors():
    """Get all connected apps for the authenticated user via Composio.
    ---
    tags:
      - Connectors
    security:
      - BearerAuth: []
    responses:
      200:
        description: List of active connector slugs
        schema:
          type: array
          items:
            type: string
            example: gmail
      401:
        description: Unauthorized
    """
    try:
        user = request.user

        composio_client = Composio()

        # list requested apps we support
        supported_apps = [
            "jira",
            "asana",
            "trello",
            "notion",
            "productboard",
            "gmail",
            "outlook",
            "slack",
            "googlecalendar",
            "googledocs",
            "googlesheets",
            "salesforce",
            "hubspot",
        ]

        active_apps = []
        try:
            connections = composio_client.connected_accounts.list(user_ids=[user.id])
            for conn in connections.items:
                slug = getattr(getattr(conn, "toolkit", None), "slug", None)
                if slug and slug.lower() in supported_apps:
                    active_apps.append(slug.lower())
        except Exception as e:
            # Fallback if the connections API differs
            print(f"Warn: Could not fetch connections exactly: {e}")
            pass

        return jsonify(active_apps)
    except Exception as e:
        print(f"Error fetching active connectors: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route("/generate_link", methods=["GET"])
@auth_middleware
def generate_connection_link():
    """Generate a Composio OAuth link for a specific app.
    ---
    tags:
      - Connectors
    security:
      - BearerAuth: []
    parameters:
      - in: query
        name: app
        type: string
        required: true
        description: App name to connect (e.g. gmail, slack, jira)
    responses:
      200:
        description: OAuth redirect URL
        schema:
          type: object
          properties:
            url:
              type: string
      400:
        description: Missing app parameter or integration not enabled
      401:
        description: Unauthorized
    """
    try:
        user = request.user
        app_name = request.args.get("app")
        if not app_name:
            return jsonify({"error": "Missing 'app' parameter"}), 400

        composio_client = Composio()

        # We need the specific Auth Config ID (ac_***) instead of just the app name
        auth_configs = composio_client.auth_configs.list()
        auth_config_id = None
        for config in auth_configs.items:
            # Check if toolkit slug matches the requested app
            if config.toolkit.slug == app_name.lower() or config.name.startswith(
                app_name.lower()
            ):
                auth_config_id = getattr(config, "id", None)
                break

        if not auth_config_id:
            return (
                jsonify(
                    {
                        "error": f"Integration '{app_name}' is not enabled. Please enable it in the Composio dashboard."
                    }
                ),
                400,
            )

        connection_request = composio_client.connected_accounts.initiate(
            user_id=user.id, auth_config_id=auth_config_id
        )

        print(f"Connection initiated for {app_name}: {connection_request.redirect_url}")
        return jsonify({"url": connection_request.redirect_url})

    except Exception as e:
        print(f"Error generating connection link: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route("/disconnect", methods=["POST"])
@auth_middleware
def disconnect_connector():
    """Disconnect a Composio integration.
    ---
    tags:
      - Connectors
    security:
      - BearerAuth: []
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - app
          properties:
            app:
              type: string
              description: App slug to disconnect
              example: gmail
    responses:
      200:
        description: Disconnected successfully
        schema:
          type: object
          properties:
            success:
              type: boolean
      400:
        description: Missing app parameter
      401:
        description: Unauthorized
      404:
        description: No active connection found
    """
    try:
        user = request.user
        data = request.get_json() or {}
        app_name = data.get("app")
        if not app_name:
            return jsonify({"error": "Missing 'app' parameter"}), 400

        composio_client = Composio()

        connections = composio_client.connected_accounts.list(user_ids=[user.id])
        connection_to_delete = None

        for conn in connections.items:
            slug = getattr(getattr(conn, "toolkit", None), "slug", None)
            if slug and (
                slug.lower() == app_name.lower()
                or slug.lower().startswith(app_name.lower())
            ):
                connection_to_delete = getattr(conn, "id", None)
                break

        if not connection_to_delete:
            return (
                jsonify({"error": f"No active connection found for '{app_name}'"}),
                404,
            )

        composio_client.connected_accounts.delete(connection_to_delete)
        return jsonify({"success": True})

    except Exception as e:
        print(f"Error disconnecting: {e}")
        return jsonify({"error": str(e)}), 500
