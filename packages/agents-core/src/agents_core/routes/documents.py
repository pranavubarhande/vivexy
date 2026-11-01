from flask import Blueprint, jsonify, request
from pydantic import ValidationError

from agents_core.business_logic.documents import (
    DocumentAccessError,
    DocumentStorageError,
    DocumentValidationError,
    delete_document,
    get_document,
    get_document_file_url,
    get_document_page,
    list_documents,
    reprocess_document,
    upload_documents,
)
from agents_core.business_logic.features import require_feature
from agents_core.constants.features import FEATURE_RAG
from agents_core.middlewares.auth import auth_middleware
from agents_core.schemas.document import DocumentListQuery, DocumentScope

bp = Blueprint("documents", __name__, url_prefix="/api/documents")


def _error(message: str, status: int):
    return jsonify({"error": message}), status


@bp.route("", methods=["POST"])
@auth_middleware
@require_feature(FEATURE_RAG)
def upload():
    """Upload documents to the document store for background processing.
    ---
    tags:
      - Documents
    security:
      - BearerAuth: []
    consumes:
      - multipart/form-data
    parameters:
      - in: formData
        name: files
        type: file
        required: true
        description: PDF, DOCX, TXT, MD, EML or ZIP files (ZIPs are unpacked)
      - in: formData
        name: teamId
        type: string
      - in: formData
        name: scopeType
        type: string
        description: Scope registered by an extension, e.g. "matter"
      - in: formData
        name: scopeId
        type: string
    responses:
      202:
        description: Documents accepted and queued for processing
      400:
        description: Invalid upload
      403:
        description: No access to the team or scope
      502:
        description: File storage is unavailable
    """
    try:
        scope = DocumentScope(**request.form.to_dict())
        documents = upload_documents(
            request.user,
            request.files.getlist("files"),
            team_id=scope.team_id,
            scope_type=scope.scope_type,
            scope_id=scope.scope_id,
        )
        return jsonify({"documents": documents}), 202
    except ValidationError as e:
        return _error(e.errors()[0]["msg"], 400)
    except DocumentValidationError as e:
        return _error(str(e), 400)
    except DocumentAccessError as e:
        return _error(str(e), 403)
    except DocumentStorageError as e:
        return _error(str(e), 502)


@bp.route("", methods=["GET"])
@auth_middleware
@require_feature(FEATURE_RAG)
def list_all():
    """List documents for a team or personal space, optionally within a scope.
    ---
    tags:
      - Documents
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
        name: status
        type: string
        enum: [queued, processing, ready, failed]
      - in: query
        name: page
        type: integer
      - in: query
        name: pageSize
        type: integer
    responses:
      200:
        description: Paginated documents
    """
    try:
        query = DocumentListQuery(**request.args.to_dict())
        return jsonify(
            list_documents(
                request.user,
                team_id=query.team_id,
                scope_type=query.scope_type,
                scope_id=query.scope_id,
                status=query.status,
                page=query.page,
                page_size=query.page_size,
            )
        )
    except ValidationError as e:
        return _error(e.errors()[0]["msg"], 400)
    except DocumentValidationError as e:
        return _error(str(e), 400)
    except DocumentAccessError as e:
        return _error(str(e), 403)


@bp.route("/<document_id>", methods=["GET"])
@auth_middleware
@require_feature(FEATURE_RAG)
def detail(document_id):
    """Get a document and its processing status.
    ---
    tags:
      - Documents
    security:
      - BearerAuth: []
    responses:
      200:
        description: Document
      404:
        description: Not found
    """
    try:
        return jsonify(get_document(document_id, request.user))
    except LookupError as e:
        return _error(str(e), 404)


@bp.route("/<document_id>/pages/<int:page_number>", methods=["GET"])
@auth_middleware
@require_feature(FEATURE_RAG)
def page(document_id, page_number):
    """Get the extracted text of one page, for the source viewer.
    ---
    tags:
      - Documents
    security:
      - BearerAuth: []
    responses:
      200:
        description: Page text
      404:
        description: Not found
    """
    try:
        return jsonify(get_document_page(document_id, page_number, request.user))
    except LookupError as e:
        return _error(str(e), 404)


@bp.route("/<document_id>/file", methods=["GET"])
@auth_middleware
@require_feature(FEATURE_RAG)
def file_url(document_id):
    """Get a short-lived download link for the original file.
    ---
    tags:
      - Documents
    security:
      - BearerAuth: []
    responses:
      200:
        description: Presigned URL valid for 15 minutes
      404:
        description: Not found
    """
    try:
        return jsonify({"url": get_document_file_url(document_id, request.user)})
    except LookupError as e:
        return _error(str(e), 404)
    except DocumentStorageError as e:
        return _error(str(e), 502)


@bp.route("/<document_id>", methods=["DELETE"])
@auth_middleware
@require_feature(FEATURE_RAG)
def delete(document_id):
    """Delete a document, its file and its search index entries.
    ---
    tags:
      - Documents
    security:
      - BearerAuth: []
    responses:
      204:
        description: Deleted
      404:
        description: Not found
    """
    try:
        delete_document(document_id, request.user)
        return "", 204
    except LookupError as e:
        return _error(str(e), 404)


@bp.route("/<document_id>/reprocess", methods=["POST"])
@auth_middleware
@require_feature(FEATURE_RAG)
def reprocess(document_id):
    """Queue a document for processing again, e.g. after a failure.
    ---
    tags:
      - Documents
    security:
      - BearerAuth: []
    responses:
      202:
        description: Queued
      400:
        description: Already processing
      404:
        description: Not found
    """
    try:
        return jsonify(reprocess_document(document_id, request.user)), 202
    except LookupError as e:
        return _error(str(e), 404)
    except DocumentValidationError as e:
        return _error(str(e), 400)
