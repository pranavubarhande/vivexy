import logging
import re
from typing import Any, Dict, List, Optional

from sqlalchemy import func, or_

from agents_core.business_logic.documents import (
    DocumentValidationError,
    authorize_scope,
)
from agents_core.constants.documents import DOCUMENT_STATUS_READY
from agents_core.models import Document, DocumentChunk, User, db
from agents_core.services.document_vector_store import namespace_for, query_vectors
from agents_core.services.embeddings import embed_query

logger = logging.getLogger(__name__)

SEARCH_DEFAULT_LIMIT = 8
SEARCH_MAX_LIMIT = 25
SEARCH_MAX_DOCUMENT_IDS = 100
SEARCH_CANDIDATE_MULTIPLIER = 4
# Reciprocal rank fusion constant: dampens the weight of top ranks so a chunk
# found by both vector and keyword search beats one found by either alone.
RRF_K = 60
MARKER_ID_LENGTH = 8


def citation_marker_id(chunk_id: str) -> str:
    return chunk_id.replace("-", "")[:MARKER_ID_LENGTH]


def _documents_query(
    user: User,
    team_id: Optional[str],
    scope_type: Optional[str],
    scope_id: Optional[str],
    document_ids: Optional[List[str]],
):
    query = Document.query.filter_by(
        team_id=team_id,
        scope_type=scope_type,
        scope_id=scope_id,
        status=DOCUMENT_STATUS_READY,
    )
    if not team_id:
        query = query.filter_by(owner_id=user.id)
    if document_ids:
        query = query.filter(Document.id.in_(document_ids))
    return query


def _vector_candidates(
    user: User,
    team_id: Optional[str],
    scope_type: Optional[str],
    scope_id: Optional[str],
    document_ids: Optional[List[str]],
    query: str,
    top_k: int,
) -> List[str]:
    metadata_filter: Dict[str, Any] = (
        {"scope_type": scope_type, "scope_id": scope_id}
        if scope_type
        else {"scope_type": {"$exists": False}}
    )
    if document_ids:
        metadata_filter["document_id"] = {"$in": document_ids}
    matches = query_vectors(
        namespace_for(team_id, user.id),
        embed_query(query),
        top_k,
        metadata_filter,
    )
    return [match["id"] for match in matches]


def _keyword_candidates(document_ids_query, query: str, top_k: int) -> List[str]:
    chunk_query = DocumentChunk.query.filter(
        DocumentChunk.document_id.in_(document_ids_query)
    )
    if db.engine.dialect.name == "postgresql":
        vector = func.to_tsvector("english", DocumentChunk.text)
        ts_query = func.websearch_to_tsquery("english", query)
        rows = (
            chunk_query.filter(vector.op("@@")(ts_query))
            .order_by(func.ts_rank_cd(vector, ts_query).desc())
            .limit(top_k)
            .with_entities(DocumentChunk.id)
            .all()
        )
    else:
        terms = [term for term in re.findall(r"\w+", query.lower()) if len(term) > 2]
        if not terms:
            return []
        rows = (
            chunk_query.filter(
                or_(*[DocumentChunk.text.ilike(f"%{term}%") for term in terms])
            )
            .limit(top_k)
            .with_entities(DocumentChunk.id)
            .all()
        )
    return [row[0] for row in rows]


def _fuse(ranked_lists: List[List[str]]) -> List[str]:
    scores: Dict[str, float] = {}
    for ranked in ranked_lists:
        for rank, chunk_id in enumerate(ranked):
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (RRF_K + rank + 1)
    return sorted(scores, key=lambda chunk_id: scores[chunk_id], reverse=True)


def search_documents(
    user: User,
    query: str,
    team_id: Optional[str] = None,
    scope_type: Optional[str] = None,
    scope_id: Optional[str] = None,
    document_ids: Optional[List[str]] = None,
    limit: int = SEARCH_DEFAULT_LIMIT,
) -> List[Dict[str, Any]]:
    """Hybrid search over ready documents the user can access. Pinecone and
    Postgres full-text results are fused, then every hit is re-checked
    against Postgres so a stale vector can never surface a deleted or
    out-of-scope document."""
    query = (query or "").strip()
    if not query:
        raise DocumentValidationError("Enter something to search for")
    if document_ids and len(document_ids) > SEARCH_MAX_DOCUMENT_IDS:
        raise DocumentValidationError(
            f"Search at most {SEARCH_MAX_DOCUMENT_IDS} documents at a time"
        )
    authorize_scope(user, team_id, scope_type, scope_id)
    limit = min(max(limit, 1), SEARCH_MAX_LIMIT)
    top_k = limit * SEARCH_CANDIDATE_MULTIPLIER

    documents_query = _documents_query(
        user, team_id, scope_type, scope_id, document_ids
    )
    allowed_ids_query = documents_query.with_entities(Document.id)

    ranked_lists = [_keyword_candidates(allowed_ids_query, query, top_k)]
    try:
        ranked_lists.append(
            _vector_candidates(
                user, team_id, scope_type, scope_id, document_ids, query, top_k
            )
        )
    except Exception:
        logger.exception("Vector search failed; using keyword results only")

    fused_ids = _fuse(ranked_lists)
    if not fused_ids:
        return []
    rows = (
        db.session.query(DocumentChunk, Document)
        .join(Document, Document.id == DocumentChunk.document_id)
        .filter(DocumentChunk.id.in_(fused_ids))
        .filter(Document.id.in_(allowed_ids_query))
        .all()
    )
    by_id = {chunk.id: (chunk, document) for chunk, document in rows}
    results = []
    for chunk_id in fused_ids:
        if chunk_id not in by_id:
            continue
        chunk, document = by_id[chunk_id]
        results.append(
            {
                "id": citation_marker_id(chunk.id),
                "chunkId": chunk.id,
                "documentId": document.id,
                "filename": document.filename,
                "paginated": document.paginated,
                "pageNumber": chunk.page_number,
                "charStart": chunk.char_start,
                "charEnd": chunk.char_end,
                "quote": chunk.text,
            }
        )
        if len(results) == limit:
            break
    return results
