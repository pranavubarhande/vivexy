"""
GitHub OAuth Integration Routes.
Handles GitHub OAuth flow, repo management and proxying GitHub API calls.
"""

import logging
import os

import requests
from flask import Blueprint, jsonify, redirect, request

from app.middlewares.auth import auth_middleware
from app.models.base import db
from app.models.github import GithubConnection, GithubRepo

logger = logging.getLogger(__name__)

bp = Blueprint("github", __name__, url_prefix="/github")

GITHUB_OAUTH_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_API_BASE = "https://api.github.com"


def _get_client_id():
    return os.environ.get("GITHUB_CLIENT_ID", "")


def _get_client_secret():
    return os.environ.get("GITHUB_CLIENT_SECRET", "")


def _get_redirect_uri():
    return os.environ.get(
        "GITHUB_REDIRECT_URI", "http://localhost:5000/github/callback"
    )


def _get_frontend_url():
    return os.environ.get("FRONTEND_URL", "http://localhost:3000")


def _github_headers(access_token: str) -> dict:
    return {
        "Authorization": f"token {access_token}",
        "Accept": "application/vnd.github.v3+json",
    }


@bp.route("/auth", methods=["GET"])
@auth_middleware
def github_auth():
    """Return GitHub OAuth authorization URL."""
    try:
        user = request.user
        # Encode the JWT token from the Authorization header as state
        auth_header = request.headers.get("Authorization", "")
        jwt_token = (
            auth_header.split(" ")[1] if auth_header.startswith("Bearer ") else ""
        )

        client_id = _get_client_id()
        redirect_uri = _get_redirect_uri()
        scope = "repo,read:user"

        url = (
            f"{GITHUB_OAUTH_URL}"
            f"?client_id={client_id}"
            f"&redirect_uri={redirect_uri}"
            f"&scope={scope}"
            f"&state={jwt_token}"
        )
        return jsonify({"url": url})
    except Exception as e:
        logger.exception("github_auth error")
        return jsonify({"error": str(e)}), 500


@bp.route("/callback", methods=["GET"])
def github_callback():
    """Handle GitHub OAuth callback — exchange code for token, save connection, redirect to frontend."""
    frontend_url = _get_frontend_url()

    code = request.args.get("code")
    state = request.args.get("state")  # JWT token
    error = request.args.get("error")

    if error:
        return redirect(f"{frontend_url}/settings?tab=connections&github_error={error}")

    if not code:
        return redirect(
            f"{frontend_url}/settings?tab=connections&github_error=missing_code"
        )

    if not state:
        return redirect(
            f"{frontend_url}/settings?tab=connections&github_error=missing_state"
        )

    # Decode the JWT token from state to identify the user
    try:
        from app.utils.auth import verify_token

        payload = verify_token(state)
        user_id = payload.get("userId")
        if not user_id:
            return redirect(
                f"{frontend_url}/settings?tab=connections&github_error=invalid_token"
            )
    except Exception as e:
        logger.warning("github_callback: invalid state token: %s", e)
        return redirect(
            f"{frontend_url}/settings?tab=connections&github_error=invalid_token"
        )

    # Exchange code for access token
    try:
        token_resp = requests.post(
            GITHUB_TOKEN_URL,
            json={
                "client_id": _get_client_id(),
                "client_secret": _get_client_secret(),
                "code": code,
                "redirect_uri": _get_redirect_uri(),
            },
            headers={"Accept": "application/json"},
            timeout=15,
        )
        token_resp.raise_for_status()
        token_data = token_resp.json()
    except Exception as e:
        logger.exception("github_callback: token exchange failed")
        return redirect(
            f"{frontend_url}/settings?tab=connections&github_error=token_exchange_failed"
        )

    access_token = token_data.get("access_token")
    if not access_token:
        err = token_data.get("error", "no_token")
        return redirect(f"{frontend_url}/settings?tab=connections&github_error={err}")

    scope = token_data.get("scope", "")

    # Fetch GitHub user info
    try:
        user_resp = requests.get(
            f"{GITHUB_API_BASE}/user",
            headers=_github_headers(access_token),
            timeout=15,
        )
        user_resp.raise_for_status()
        github_user = user_resp.json()
    except Exception as e:
        logger.exception("github_callback: failed to fetch github user")
        return redirect(
            f"{frontend_url}/settings?tab=connections&github_error=user_fetch_failed"
        )

    # Upsert GithubConnection
    try:
        conn = GithubConnection.query.filter_by(user_id=user_id).first()
        if conn:
            conn.access_token = access_token
            conn.scope = scope
            conn.github_user_id = str(github_user.get("id", ""))
            conn.github_username = github_user.get("login", "")
            conn.github_avatar = github_user.get("avatar_url", "")
        else:
            conn = GithubConnection(
                user_id=user_id,
                access_token=access_token,
                scope=scope,
                github_user_id=str(github_user.get("id", "")),
                github_username=github_user.get("login", ""),
                github_avatar=github_user.get("avatar_url", ""),
            )
            db.session.add(conn)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        logger.exception("github_callback: failed to save connection")
        return redirect(
            f"{frontend_url}/settings?tab=connections&github_error=db_error"
        )

    return redirect(f"{frontend_url}/settings?tab=connections&github_connected=true")


@bp.route("/status", methods=["GET"])
@auth_middleware
def github_status():
    """Return GitHub connection status for the current user."""
    try:
        user = request.user
        conn = GithubConnection.query.filter_by(user_id=user.id).first()
        if not conn:
            return jsonify({"connected": False})
        return jsonify({"connected": True, "connection": conn.to_dict()})
    except Exception as e:
        logger.exception("github_status error")
        return jsonify({"error": str(e)}), 500


@bp.route("/repos", methods=["GET"])
@auth_middleware
def github_repos():
    """Fetch repositories from GitHub API using the stored access token."""
    try:
        user = request.user
        conn = GithubConnection.query.filter_by(user_id=user.id).first()
        if not conn:
            return jsonify({"error": "GitHub not connected"}), 404

        page = request.args.get("page", 1, type=int)
        per_page = request.args.get("per_page", 30, type=int)

        resp = requests.get(
            f"{GITHUB_API_BASE}/user/repos",
            headers=_github_headers(conn.access_token),
            params={
                "page": page,
                "per_page": per_page,
                "sort": "updated",
                "type": "all",
            },
            timeout=15,
        )
        resp.raise_for_status()
        repos = resp.json()

        return jsonify(repos)
    except requests.HTTPError as e:
        logger.warning("github_repos HTTP error: %s", e)
        return jsonify({"error": "GitHub API error", "details": str(e)}), 502
    except Exception as e:
        logger.exception("github_repos error")
        return jsonify({"error": str(e)}), 500


@bp.route("/repos/link", methods=["POST"])
@auth_middleware
def link_repo():
    """Link a GitHub repository to the user's portfolio helper account."""
    try:
        user = request.user
        data = request.get_json() or {}
        full_name = data.get("full_name")
        if not full_name:
            return jsonify({"error": "full_name is required"}), 400

        conn = GithubConnection.query.filter_by(user_id=user.id).first()
        if not conn:
            return jsonify({"error": "GitHub not connected"}), 404

        # Fetch repo details from GitHub
        resp = requests.get(
            f"{GITHUB_API_BASE}/repos/{full_name}",
            headers=_github_headers(conn.access_token),
            timeout=15,
        )
        resp.raise_for_status()
        repo_data = resp.json()

        # Create or update the GithubRepo record
        repo = GithubRepo.query.filter_by(
            connection_id=conn.id, full_name=full_name
        ).first()
        if repo:
            repo.is_linked = True
            repo.github_repo_id = repo_data.get("id")
            repo.name = repo_data.get("name", full_name.split("/")[-1])
            repo.owner = repo_data.get("owner", {}).get("login", "")
            repo.private = repo_data.get("private", False)
            repo.default_branch = repo_data.get("default_branch", "main")
            repo.description = repo_data.get("description")
            repo.html_url = repo_data.get("html_url")
        else:
            repo = GithubRepo(
                connection_id=conn.id,
                github_repo_id=repo_data.get("id"),
                full_name=full_name,
                name=repo_data.get("name", full_name.split("/")[-1]),
                owner=repo_data.get("owner", {}).get("login", ""),
                private=repo_data.get("private", False),
                default_branch=repo_data.get("default_branch", "main"),
                description=repo_data.get("description"),
                html_url=repo_data.get("html_url"),
                is_linked=True,
            )
            db.session.add(repo)

        db.session.commit()
        return jsonify(repo.to_dict()), 201
    except requests.HTTPError as e:
        return jsonify({"error": "GitHub API error", "details": str(e)}), 502
    except Exception as e:
        logger.exception("link_repo error")
        return jsonify({"error": str(e)}), 500


@bp.route("/repos/unlink", methods=["DELETE"])
@auth_middleware
def unlink_repo():
    """Unlink a GitHub repository."""
    try:
        user = request.user
        data = request.get_json() or {}
        full_name = data.get("full_name")
        if not full_name:
            return jsonify({"error": "full_name is required"}), 400

        conn = GithubConnection.query.filter_by(user_id=user.id).first()
        if not conn:
            return jsonify({"error": "GitHub not connected"}), 404

        repo = GithubRepo.query.filter_by(
            connection_id=conn.id, full_name=full_name
        ).first()
        if not repo:
            return jsonify({"error": "Repository not found"}), 404

        repo.is_linked = False
        db.session.commit()
        return jsonify({"success": True, "repo": repo.to_dict()})
    except Exception as e:
        logger.exception("unlink_repo error")
        return jsonify({"error": str(e)}), 500


@bp.route("/repos/linked", methods=["GET"])
@auth_middleware
def linked_repos():
    """Return all linked repositories for the current user."""
    try:
        user = request.user
        conn = GithubConnection.query.filter_by(user_id=user.id).first()
        if not conn:
            return jsonify([])

        repos = GithubRepo.query.filter_by(connection_id=conn.id, is_linked=True).all()
        return jsonify([r.to_dict() for r in repos])
    except Exception as e:
        logger.exception("linked_repos error")
        return jsonify({"error": str(e)}), 500


@bp.route("/disconnect", methods=["DELETE"])
@auth_middleware
def github_disconnect():
    """Delete the GitHub connection for the current user."""
    try:
        user = request.user
        conn = GithubConnection.query.filter_by(user_id=user.id).first()
        if not conn:
            return jsonify({"error": "GitHub not connected"}), 404

        db.session.delete(conn)
        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        logger.exception("github_disconnect error")
        return jsonify({"error": str(e)}), 500


@bp.route("/repos/<path:full_name>/contents", methods=["GET"])
@auth_middleware
def repo_contents(full_name):
    """Proxy GitHub API: get file/directory contents for a repo."""
    try:
        user = request.user
        conn = GithubConnection.query.filter_by(user_id=user.id).first()
        if not conn:
            return jsonify({"error": "GitHub not connected"}), 404

        path = request.args.get("path", "")
        ref = request.args.get("ref")

        params = {}
        if ref:
            params["ref"] = ref

        api_path = f"{GITHUB_API_BASE}/repos/{full_name}/contents"
        if path:
            api_path = f"{api_path}/{path}"

        resp = requests.get(
            api_path,
            headers=_github_headers(conn.access_token),
            params=params,
            timeout=15,
        )
        resp.raise_for_status()
        return jsonify(resp.json())
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else 502
        return jsonify({"error": "GitHub API error", "details": str(e)}), status
    except Exception as e:
        logger.exception("repo_contents error")
        return jsonify({"error": str(e)}), 500


@bp.route("/repos/<path:full_name>/commits", methods=["GET"])
@auth_middleware
def repo_commits(full_name):
    """Proxy GitHub API: get latest 10 commits for a repo."""
    try:
        user = request.user
        conn = GithubConnection.query.filter_by(user_id=user.id).first()
        if not conn:
            return jsonify({"error": "GitHub not connected"}), 404

        resp = requests.get(
            f"{GITHUB_API_BASE}/repos/{full_name}/commits",
            headers=_github_headers(conn.access_token),
            params={"per_page": 10},
            timeout=15,
        )
        resp.raise_for_status()
        return jsonify(resp.json())
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else 502
        return jsonify({"error": "GitHub API error", "details": str(e)}), status
    except Exception as e:
        logger.exception("repo_commits error")
        return jsonify({"error": str(e)}), 500


@bp.route("/repos/<path:full_name>/branches", methods=["GET"])
@auth_middleware
def repo_branches(full_name):
    """Proxy GitHub API: list branches for a repo."""
    try:
        user = request.user
        conn = GithubConnection.query.filter_by(user_id=user.id).first()
        if not conn:
            return jsonify({"error": "GitHub not connected"}), 404

        resp = requests.get(
            f"{GITHUB_API_BASE}/repos/{full_name}/branches",
            headers=_github_headers(conn.access_token),
            timeout=15,
        )
        resp.raise_for_status()
        return jsonify(resp.json())
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else 502
        return jsonify({"error": "GitHub API error", "details": str(e)}), status
    except Exception as e:
        logger.exception("repo_branches error")
        return jsonify({"error": str(e)}), 500
