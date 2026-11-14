from functools import wraps

from flask import Blueprint, jsonify, request
from pydantic import ValidationError

from agents_core.business_logic.prompts import (
    PromptAccessError,
    PromptNotFoundError,
    PromptValidationError,
    create_prompt,
    delete_prompt,
    duplicate_prompt,
    get_prompt,
    list_prompts,
    render_prompt,
    update_prompt,
)
from agents_core.constants.prompts import PROMPT_VISIBILITY_PERSONAL
from agents_core.middlewares.auth import auth_middleware
from agents_core.schemas.prompt import PromptInput, PromptListQuery, PromptRenderInput

bp = Blueprint("prompts", __name__, url_prefix="/api/prompts")


def _error(message: str, status: int):
    return jsonify({"error": message}), status


def _handle_errors(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        try:
            return view(*args, **kwargs)
        except ValidationError as e:
            return _error(e.errors()[0]["msg"].removeprefix("Value error, "), 400)
        except PromptValidationError as e:
            return _error(str(e), 400)
        except PromptAccessError as e:
            return _error(str(e), 403)
        except PromptNotFoundError as e:
            return _error(str(e), 404)

    return wrapped


def _body() -> dict:
    return request.get_json(silent=True) or {}


@bp.route("", methods=["GET"])
@auth_middleware
@_handle_errors
def list_all():
    """List built-in, team and personal prompts.
    ---
    tags:
      - Prompts
    security:
      - BearerAuth: []
    parameters:
      - in: query
        name: teamId
        type: string
      - in: query
        name: category
        type: string
      - in: query
        name: search
        type: string
    responses:
      200:
        description: Prompts, categories and whether the user manages team prompts
    """
    query = PromptListQuery(**request.args.to_dict())
    return jsonify(
        list_prompts(request.user, query.team_id, query.category, query.search)
    )


@bp.route("", methods=["POST"])
@auth_middleware
@_handle_errors
def create():
    """Save a personal prompt, or a team prompt (team admins only).
    ---
    tags:
      - Prompts
    security:
      - BearerAuth: []
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required: [title, body]
          properties:
            title:
              type: string
            description:
              type: string
            category:
              type: string
            body:
              type: string
              description: Text with {{key}} placeholders, one per field
            fields:
              type: array
              items:
                type: object
            visibility:
              type: string
              enum: [personal, team]
            teamId:
              type: string
    responses:
      201:
        description: Prompt
    """
    return jsonify(create_prompt(request.user, PromptInput(**_body()))), 201


@bp.route("/<prompt_id>", methods=["GET"])
@auth_middleware
@_handle_errors
def detail(prompt_id):
    """Get one prompt.
    ---
    tags:
      - Prompts
    security:
      - BearerAuth: []
    responses:
      200:
        description: Prompt
    """
    return jsonify(get_prompt(prompt_id, request.user))


@bp.route("/<prompt_id>", methods=["PUT"])
@auth_middleware
@_handle_errors
def update(prompt_id):
    """Change a prompt you own, or a team prompt as a team admin.
    ---
    tags:
      - Prompts
    security:
      - BearerAuth: []
    responses:
      200:
        description: Prompt
    """
    return jsonify(update_prompt(prompt_id, request.user, PromptInput(**_body())))


@bp.route("/<prompt_id>", methods=["DELETE"])
@auth_middleware
@_handle_errors
def delete(prompt_id):
    """Delete a prompt you own, or a team prompt as a team admin.
    ---
    tags:
      - Prompts
    security:
      - BearerAuth: []
    responses:
      204:
        description: Deleted
    """
    delete_prompt(prompt_id, request.user)
    return "", 204


@bp.route("/<prompt_id>/render", methods=["POST"])
@auth_middleware
@_handle_errors
def render(prompt_id):
    """Fill in a prompt's fields and get the text to send.
    ---
    tags:
      - Prompts
    security:
      - BearerAuth: []
    parameters:
      - in: body
        name: body
        schema:
          type: object
          properties:
            values:
              type: object
    responses:
      200:
        description: The filled-in text
    """
    data = PromptRenderInput(**_body())
    return jsonify(render_prompt(prompt_id, request.user, data.values))


@bp.route("/<prompt_id>/duplicate", methods=["POST"])
@auth_middleware
@_handle_errors
def duplicate(prompt_id):
    """Copy a prompt as a personal prompt, or as a team prompt (team admins).
    ---
    tags:
      - Prompts
    security:
      - BearerAuth: []
    parameters:
      - in: body
        name: body
        schema:
          type: object
          properties:
            visibility:
              type: string
              enum: [personal, team]
            teamId:
              type: string
    responses:
      201:
        description: The copy
    """
    body = _body()
    copy = duplicate_prompt(
        prompt_id,
        request.user,
        body.get("visibility") or PROMPT_VISIBILITY_PERSONAL,
        body.get("team_id") or body.get("teamId"),
    )
    return jsonify(copy), 201
