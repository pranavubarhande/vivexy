"""
Casing utility helpers for converting dict keys between snake_case and camelCase.
Used by Flask before_request / after_request hooks to normalise data on the wire.
"""

import re
from typing import Any


def _to_camel(key: str) -> str:
    """Convert snake_case key to camelCase."""
    parts = key.split("_")
    return parts[0] + "".join(word.capitalize() for word in parts[1:])


def _to_snake(key: str) -> str:
    """Convert camelCase key to snake_case."""
    # Insert underscore before each uppercase letter, then lowercase everything
    s1 = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", key)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s1).lower()


def snake_to_camel(obj: Any) -> Any:
    """
    Recursively convert all dict keys from snake_case → camelCase.
    Keys that start with '_' (e.g. _count) are left unchanged.
    """
    if isinstance(obj, list):
        return [snake_to_camel(item) for item in obj]
    if isinstance(obj, dict):
        return {
            (k if k.startswith("_") else _to_camel(k)): snake_to_camel(v)
            for k, v in obj.items()
        }
    return obj


def camel_to_snake(obj: Any) -> Any:
    """
    Recursively convert all dict keys from camelCase → snake_case.
    Keys that start with '_' are left unchanged.
    """
    if isinstance(obj, list):
        return [camel_to_snake(item) for item in obj]
    if isinstance(obj, dict):
        return {
            (k if k.startswith("_") else _to_snake(k)): camel_to_snake(v)
            for k, v in obj.items()
        }
    return obj
