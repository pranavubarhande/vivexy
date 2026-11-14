import io
from functools import wraps

from flask import Blueprint, jsonify, request, send_file
from pydantic import ValidationError

from agents_core.business_logic.document_analyses import (
    AnalysisNotFoundError,
    AnalysisValidationError,
    add_question,
    cancel_analysis,
    create_analysis,
    delete_analysis,
    export_analysis,
    get_analysis,
    list_analyses,
    remove_question,
    rerun_question,
    retry_failed,
)
from agents_core.business_logic.documents import (
    DocumentAccessError,
    DocumentValidationError,
)
from agents_core.business_logic.features import require_feature
from agents_core.constants.features import FEATURE_RAG
from agents_core.middlewares.auth import auth_middleware
from agents_core.schemas.document_analysis import (
    AnalysisCreate,
    AnalysisListQuery,
    AnalysisQuestionInput,
)

bp = Blueprint("document_analyses", __name__, url_prefix="/api/analyses")


def _error(message: str, status: int):
    return jsonify({"error": message}), status


def _handle_errors(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        try:
            return view(*args, **kwargs)
        except ValidationError as e:
            return _error(e.errors()[0]["msg"], 400)
        except (AnalysisValidationError, DocumentValidationError) as e:
            return _error(str(e), 400)
        except (DocumentAccessError, PermissionError) as e:
            return _error(str(e), 403)
        except (AnalysisNotFoundError, LookupError) as e:
            return _error(str(e), 404)

    return wrapped


def _body() -> dict:
    return request.get_json(silent=True) or {}


@bp.route("", methods=["POST"])
@auth_middleware
@require_feature(FEATURE_RAG)
@_handle_errors
def create():
    """Start a review grid, summary or timeline over ready documents.
    ---
    tags:
      - Analyses
    security:
      - BearerAuth: []
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required: [kind, documentIds, modelId]
          properties:
            kind:
              type: string
              enum: [review, summary, timeline]
            title:
              type: string
            documentIds:
              type: array
              items:
                type: string
            questions:
              type: array
              description: Review only, 1 to 15
              items:
                type: object
                properties:
                  label:
                    type: string
                  prompt:
                    type: string
            modelId:
              type: string
            length:
              type: string
              enum: [short, detailed]
            teamId:
              type: string
            scopeType:
              type: string
            scopeId:
              type: string
    responses:
      201:
        description: Analysis queued
      400:
        description: Invalid request
      403:
        description: No access to the team, scope or model
    """
    return jsonify(create_analysis(request.user, AnalysisCreate(**_body()))), 201


@bp.route("", methods=["GET"])
@auth_middleware
@require_feature(FEATURE_RAG)
@_handle_errors
def list_all():
    """List analyses for a team or personal space, optionally within a scope.
    ---
    tags:
      - Analyses
    security:
      - BearerAuth: []
    parameters:
      - in: query
        name: teamId
        type: string
      - in: query
        name: scopeType
        type: string
      - in: query
        name: scopeId
        type: string
      - in: query
        name: kind
        type: string
        enum: [review, summary, timeline]
    responses:
      200:
        description: Analyses, newest first, with progress
    """
    query = AnalysisListQuery(**request.args.to_dict())
    return jsonify(
        {
            "analyses": list_analyses(
                request.user,
                query.team_id,
                query.scope_type,
                query.scope_id,
                kind=query.kind,
            )
        }
    )


@bp.route("/<analysis_id>", methods=["GET"])
@auth_middleware
@require_feature(FEATURE_RAG)
@_handle_errors
def detail(analysis_id):
    """Get an analysis with every cell and its citations.
    ---
    tags:
      - Analyses
    security:
      - BearerAuth: []
    responses:
      200:
        description: Analysis
      404:
        description: Not found
    """
    return jsonify(get_analysis(analysis_id, request.user))


@bp.route("/<analysis_id>", methods=["DELETE"])
@auth_middleware
@require_feature(FEATURE_RAG)
@_handle_errors
def delete(analysis_id):
    """Delete an analysis and its results.
    ---
    tags:
      - Analyses
    security:
      - BearerAuth: []
    responses:
      204:
        description: Deleted
      404:
        description: Not found
    """
    delete_analysis(analysis_id, request.user)
    return "", 204


@bp.route("/<analysis_id>/cancel", methods=["POST"])
@auth_middleware
@require_feature(FEATURE_RAG)
@_handle_errors
def cancel(analysis_id):
    """Stop a running analysis. Finished cells are kept.
    ---
    tags:
      - Analyses
    security:
      - BearerAuth: []
    responses:
      200:
        description: Analysis
    """
    return jsonify(cancel_analysis(analysis_id, request.user))


@bp.route("/<analysis_id>/retry", methods=["POST"])
@auth_middleware
@require_feature(FEATURE_RAG)
@_handle_errors
def retry(analysis_id):
    """Run every failed cell again.
    ---
    tags:
      - Analyses
    security:
      - BearerAuth: []
    responses:
      200:
        description: Analysis
    """
    return jsonify(retry_failed(analysis_id, request.user))


@bp.route("/<analysis_id>/questions", methods=["POST"])
@auth_middleware
@require_feature(FEATURE_RAG)
@_handle_errors
def create_question(analysis_id):
    """Add a question (column) to a review and answer it for every document.
    ---
    tags:
      - Analyses
    security:
      - BearerAuth: []
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required: [label, prompt]
          properties:
            label:
              type: string
            prompt:
              type: string
    responses:
      201:
        description: Analysis
    """
    analysis = add_question(analysis_id, request.user, AnalysisQuestionInput(**_body()))
    return jsonify(analysis), 201


@bp.route("/<analysis_id>/questions/<question_id>/rerun", methods=["POST"])
@auth_middleware
@require_feature(FEATURE_RAG)
@_handle_errors
def rerun(analysis_id, question_id):
    """Answer a review question again, optionally with new wording.
    ---
    tags:
      - Analyses
    security:
      - BearerAuth: []
    parameters:
      - in: body
        name: body
        schema:
          type: object
          properties:
            label:
              type: string
            prompt:
              type: string
    responses:
      200:
        description: Analysis
    """
    body = _body()
    data = AnalysisQuestionInput(**body) if body else None
    return jsonify(rerun_question(analysis_id, question_id, request.user, data))


@bp.route("/<analysis_id>/questions/<question_id>", methods=["DELETE"])
@auth_middleware
@require_feature(FEATURE_RAG)
@_handle_errors
def delete_question(analysis_id, question_id):
    """Remove a question (column) from a review.
    ---
    tags:
      - Analyses
    security:
      - BearerAuth: []
    responses:
      200:
        description: Analysis
    """
    return jsonify(remove_question(analysis_id, question_id, request.user))


@bp.route("/<analysis_id>/export", methods=["GET"])
@auth_middleware
@require_feature(FEATURE_RAG)
@_handle_errors
def export(analysis_id):
    """Download a review or timeline as Excel, or a summary as Word.
    ---
    tags:
      - Analyses
    security:
      - BearerAuth: []
    produces:
      - application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
      - application/vnd.openxmlformats-officedocument.wordprocessingml.document
    responses:
      200:
        description: File
    """
    content, filename, mimetype = export_analysis(analysis_id, request.user)
    return send_file(
        io.BytesIO(content),
        mimetype=mimetype,
        as_attachment=True,
        download_name=filename,
    )
