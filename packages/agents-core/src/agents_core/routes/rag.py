from agents_core.business_logic.features import require_feature
from agents_core.constants.features import FEATURE_RAG
from agents_core.middlewares.auth import auth_middleware
from agents_core.services.rag_service import process_rag_query
from flask import Blueprint, jsonify, request

bp = Blueprint("rag", __name__)


@bp.route("/api/rag", methods=["POST"])
@auth_middleware
@require_feature(FEATURE_RAG)
def rag_pipeline():
    """Run a RAG (Retrieval-Augmented Generation) query with optional file uploads.
    ---
    tags:
      - RAG
    security:
      - BearerAuth: []
    consumes:
      - multipart/form-data
    parameters:
      - in: formData
        name: query
        type: string
        required: true
        description: The search / question query
      - in: formData
        name: files
        type: file
        required: false
        description: Files to include in the RAG pipeline
    responses:
      200:
        description: RAG result
        schema:
          type: object
      400:
        description: Invalid query
    """
    try:
        query = request.form.get("query")
        files = request.files.getlist("files")

        result = process_rag_query(query, files)
        return jsonify(result)

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
