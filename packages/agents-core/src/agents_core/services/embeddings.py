import threading
from typing import List

from sentence_transformers import SentenceTransformer

from agents_core.constants.documents import (
    DOCUMENT_EMBEDDING_BATCH_SIZE,
    DOCUMENT_EMBEDDING_MODEL,
)

# bge models expect this instruction on queries (not on passages).
BGE_QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: "

_model_lock = threading.Lock()
_models = {}


def get_embedding_model(
    model_name: str = DOCUMENT_EMBEDDING_MODEL,
) -> SentenceTransformer:
    with _model_lock:
        if model_name not in _models:
            _models[model_name] = SentenceTransformer(model_name, device="cpu")
        return _models[model_name]


def embed_passages(
    texts: List[str], model_name: str = DOCUMENT_EMBEDDING_MODEL
) -> List[List[float]]:
    model = get_embedding_model(model_name)
    vectors = model.encode(
        texts,
        batch_size=DOCUMENT_EMBEDDING_BATCH_SIZE,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    return [vector.tolist() for vector in vectors]


def embed_query(text: str, model_name: str = DOCUMENT_EMBEDDING_MODEL) -> List[float]:
    prefix = BGE_QUERY_INSTRUCTION if "bge" in model_name.lower() else ""
    model = get_embedding_model(model_name)
    vector = model.encode(prefix + text, normalize_embeddings=True)
    return vector.tolist()
