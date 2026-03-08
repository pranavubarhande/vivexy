import pytest
from flask import Flask, jsonify

from app.middlewares.auth import auth_middleware

app = Flask(__name__)


@app.route("/test-auth")
@auth_middleware
def dummy_route():
    return jsonify({"success": True})


def test_auth_middleware_missing_header(client=None):
    with app.test_client() as c:
        response = c.get("/test-auth")
        assert response.status_code == 401
        assert response.json["error"] == "Authorization header missing or invalid"


def test_auth_middleware_invalid_header(client=None):
    with app.test_client() as c:
        response = c.get("/test-auth", headers={"Authorization": "Invalid Token"})
        assert response.status_code == 401
        assert response.json["error"] == "Authorization header missing or invalid"
