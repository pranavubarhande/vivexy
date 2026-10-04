from agents_core.services.rag_service import process_rag_query
from flask import Blueprint, jsonify, request

bp = Blueprint("rag", __name__)


@bp.route("/api/rag", methods=["POST"])
def rag_pipeline():
    """Run a RAG (Retrieval-Augmented Generation) query with optional file uploads.
    ---
    tags:
      - RAG
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
