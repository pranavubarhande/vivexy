import io
from functools import wraps

from flask import Blueprint, jsonify, request, send_file
from pydantic import ValidationError

from agents_core.business_logic.document_analyses import AnalysisValidationError
from agents_core.business_logic.documents import (
    DocumentAccessError,
    DocumentValidationError,
)
from agents_core.business_logic.features import require_feature
from agents_core.business_logic.workflows import (
    WorkflowValidationError,
    cancel_run,
    continue_run,
    delete_run,
    edit_step,
    export_run,
    get_run,
    list_runs,
    list_workflows,
    rerun_step,
    start_workflow,
)
from agents_core.constants.features import FEATURE_RAG
from agents_core.middlewares.auth import auth_middleware
from agents_core.schemas.workflow import (
    WorkflowRunListQuery,
    WorkflowStartInput,
    WorkflowStepEdit,
)

bp = Blueprint("workflows", __name__, url_prefix="/api/workflows")

DOCX_MIMETYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)


def _error(message: str, status: int):
    return jsonify({"error": message}), status


def _handle_errors(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        try:
            return view(*args, **kwargs)
        except ValidationError as e:
            return _error(e.errors()[0]["msg"].removeprefix("Value error, "), 400)
        except (
            WorkflowValidationError,
            AnalysisValidationError,
            DocumentValidationError,
        ) as e:
            return _error(str(e), 400)
        except (DocumentAccessError, PermissionError) as e:
            return _error(str(e), 403)
        except LookupError as e:
            return _error(str(e), 404)

    return wrapped


def _body() -> dict:
    return request.get_json(silent=True) or {}


@bp.route("", methods=["GET"])
@auth_middleware
@require_feature(FEATURE_RAG)
def definitions():
    """List the workflows users can run.
    ---
    tags:
      - Workflows
    security:
      - BearerAuth: []
    responses:
      200:
        description: Workflows with their inputs and steps
    """
    return jsonify({"workflows": list_workflows()})


@bp.route("/runs", methods=["POST"])
@auth_middleware
@require_feature(FEATURE_RAG)
@_handle_errors
def start():
    """Start a workflow on chosen documents.
    ---
    tags:
      - Workflows
    security:
      - BearerAuth: []
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required: [workflowKey, modelId]
          properties:
            workflowKey:
              type: string
            title:
              type: string
            documentIds:
              type: array
              items:
                type: string
            inputs:
              type: object
            modelId:
              type: string
            teamId:
              type: string
            scopeType:
              type: string
            scopeId:
              type: string
    responses:
      201:
        description: Run queued
    """
    return jsonify(start_workflow(request.user, WorkflowStartInput(**_body()))), 201


@bp.route("/runs", methods=["GET"])
@auth_middleware
@require_feature(FEATURE_RAG)
@_handle_errors
def runs():
    """List workflow runs for a team or personal space, optionally in a scope.
    ---
    tags:
      - Workflows
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
        name: workflowKey
        type: string
    responses:
      200:
        description: Runs, newest first
    """
    query = WorkflowRunListQuery(**request.args.to_dict())
    return jsonify(
        {
            "runs": list_runs(
                request.user,
                query.team_id,
                query.scope_type,
                query.scope_id,
                query.workflow_key,
            )
        }
    )


@bp.route("/runs/<run_id>", methods=["GET"])
@auth_middleware
@require_feature(FEATURE_RAG)
@_handle_errors
def detail(run_id):
    """Get a run with every step's output and sources.
    ---
    tags:
      - Workflows
    security:
      - BearerAuth: []
    responses:
      200:
        description: Run
    """
    return jsonify(get_run(run_id, request.user))


@bp.route("/runs/<run_id>", methods=["DELETE"])
@auth_middleware
@require_feature(FEATURE_RAG)
@_handle_errors
def delete(run_id):
    """Delete a run.
    ---
    tags:
      - Workflows
    security:
      - BearerAuth: []
    responses:
      204:
        description: Deleted
    """
    delete_run(run_id, request.user)
    return "", 204


@bp.route("/runs/<run_id>/continue", methods=["POST"])
@auth_middleware
@require_feature(FEATURE_RAG)
@_handle_errors
def resume(run_id):
    """Run the remaining steps, retrying a failed one.
    ---
    tags:
      - Workflows
    security:
      - BearerAuth: []
    responses:
      200:
        description: Run
    """
    return jsonify(continue_run(run_id, request.user))


@bp.route("/runs/<run_id>/cancel", methods=["POST"])
@auth_middleware
@require_feature(FEATURE_RAG)
@_handle_errors
def cancel(run_id):
    """Stop a run after the current step.
    ---
    tags:
      - Workflows
    security:
      - BearerAuth: []
    responses:
      200:
        description: Run
    """
    return jsonify(cancel_run(run_id, request.user))


@bp.route("/runs/<run_id>/steps/<step_key>", methods=["PUT"])
@auth_middleware
@require_feature(FEATURE_RAG)
@_handle_errors
def edit(run_id, step_key):
    """Replace a finished step's output; the steps after it are cleared.
    ---
    tags:
      - Workflows
    security:
      - BearerAuth: []
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required: [output]
          properties:
            output:
              type: string
    responses:
      200:
        description: Run
    """
    data = WorkflowStepEdit(**_body())
    return jsonify(edit_step(run_id, step_key, request.user, data.output))


@bp.route("/runs/<run_id>/steps/<step_key>/rerun", methods=["POST"])
@auth_middleware
@require_feature(FEATURE_RAG)
@_handle_errors
def rerun(run_id, step_key):
    """Run a step again, and every step after it.
    ---
    tags:
      - Workflows
    security:
      - BearerAuth: []
    responses:
      200:
        description: Run
    """
    return jsonify(rerun_step(run_id, step_key, request.user))


@bp.route("/runs/<run_id>/export", methods=["GET"])
@auth_middleware
@require_feature(FEATURE_RAG)
@_handle_errors
def export(run_id):
    """Download the finished steps as a Word document with numbered sources.
    ---
    tags:
      - Workflows
    security:
      - BearerAuth: []
    responses:
      200:
        description: Word document
    """
    content, filename = export_run(run_id, request.user)
    return send_file(
        io.BytesIO(content),
        mimetype=DOCX_MIMETYPE,
        as_attachment=True,
        download_name=filename,
    )
