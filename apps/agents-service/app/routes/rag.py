from flask import Blueprint, jsonify, request

from app.services.rag_service import process_rag_query

bp = Blueprint("rag", __name__)


@bp.route("/api/rag", methods=["POST"])
def rag_pipeline():
    try:
        query = request.form.get("query")
        files = request.files.getlist("files")

        result = process_rag_query(query, files)
        return jsonify(result)

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
