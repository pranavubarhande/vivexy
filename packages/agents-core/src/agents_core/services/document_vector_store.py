import os
from functools import lru_cache
from typing import Any, Dict, List, Optional

from pinecone import Pinecone

from agents_core.constants.documents import (
    DOCUMENT_PINECONE_BATCH_SIZE,
    DOCUMENT_PINECONE_INDEX,
)


def namespace_for(team_id: Optional[str], owner_id: str) -> str:
    """One Pinecone namespace per team (or per user without a team) keeps
    tenants physically apart and away from the legacy default namespace."""
    return f"documents-team-{team_id}" if team_id else f"documents-user-{owner_id}"


@lru_cache(maxsize=1)
def _get_index():
    client = Pinecone(api_key=os.environ.get("PINECONE_API_KEY"))
    return client.Index(DOCUMENT_PINECONE_INDEX)


def upsert_vectors(namespace: str, vectors: List[Dict[str, Any]]) -> None:
    index = _get_index()
    for start in range(0, len(vectors), DOCUMENT_PINECONE_BATCH_SIZE):
        index.upsert(
            vectors=vectors[start : start + DOCUMENT_PINECONE_BATCH_SIZE],
            namespace=namespace,
        )


def delete_vectors(namespace: str, vector_ids: List[str]) -> None:
    if not vector_ids:
        return
    index = _get_index()
    for start in range(0, len(vector_ids), DOCUMENT_PINECONE_BATCH_SIZE):
        index.delete(
            ids=vector_ids[start : start + DOCUMENT_PINECONE_BATCH_SIZE],
            namespace=namespace,
        )


def query_vectors(
    namespace: str,
    vector: List[float],
    top_k: int,
    metadata_filter: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    result = _get_index().query(
        namespace=namespace,
        vector=vector,
        top_k=top_k,
        include_metadata=True,
        filter=metadata_filter,
    )
    return [
        {"id": match["id"], "score": match["score"], "metadata": match["metadata"]}
        for match in result["matches"]
    ]
