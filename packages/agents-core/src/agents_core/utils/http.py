from typing import Optional

from flask import jsonify, request
from pydantic import ValidationError


def int_arg(name: str, default: int, minimum: int = 1, maximum: int = 365) -> int:
    try:
        value = int(request.args.get(name, default))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


def bool_arg(name: str) -> Optional[bool]:
    value = request.args.get(name)
    if value is None or value == "":
        return None
    return value.lower() in ("1", "true", "yes")


def error_response(error: Exception):
    """Map business-logic exceptions to HTTP responses."""
    if isinstance(error, ValidationError):
        details = error.errors(include_context=False, include_url=False)
        return jsonify({"error": "Invalid input data", "details": details}), 400
    if isinstance(error, PermissionError):
        return jsonify({"error": str(error)}), 403
    if isinstance(error, LookupError):
        return jsonify({"error": str(error)}), 404
    if isinstance(error, ValueError):
        return jsonify({"error": str(error)}), 400
    return jsonify({"error": "Internal server error"}), 500
