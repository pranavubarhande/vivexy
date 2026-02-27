"""
RAG Tools
LangChain tools for document search and retrieval using Pinecone.
"""

import os
from typing import Any, Dict, List, Optional

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from config import Config


class SearchDocumentsInput(BaseModel):
    """Input for searching documents"""

    query: str = Field(..., description="The search query to find relevant documents")
    k: int = Field(5, description="Number of results to return (default 5)")


class HybridSearchInput(BaseModel):
    """Input for hybrid search (vector + BM25)"""

    query: str = Field(..., description="The search query")
    k: int = Field(5, description="Number of results to return")


def search_documents_func(chat_id: str, query: str, k: int = 5) -> Dict[str, Any]:
    """
    Search documents using Pinecone vector search.

    Args:
        chat_id: Chat ID for context
        query: Search query
        k: Number of results

    Returns:
        Dict with search results
    """
    try:
        from langchain_huggingface.embeddings import HuggingFaceEmbeddings
        from pinecone import Pinecone

        # Initialize embeddings
        embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

        # Initialize Pinecone
        pc = Pinecone(api_key=Config.PINECONE_API_KEY)

        # Check if index exists
        if Config.PINECONE_INDEX_NAME not in [idx.name for idx in pc.list_indexes()]:
            return {
                "success": True,
                "results": [],
                "message": "No documents indexed yet",
            }

        index = pc.Index(Config.PINECONE_INDEX_NAME)

        # Embed query
        query_vector = embeddings.embed_query(query)

        # Search with chat_id filter if available
        filter_dict = None
        if chat_id:
            filter_dict = {"chat_id": chat_id}

        results = index.query(
            vector=query_vector, top_k=k, include_metadata=True, filter=filter_dict
        )

        # Format results
        formatted_results = []
        for match in results.get("matches", []):
            formatted_results.append(
                {
                    "text": match["metadata"].get("text", ""),
                    "source": match["metadata"].get("source_file", "Unknown"),
                    "score": match["score"],
                    "metadata": {
                        k: v for k, v in match["metadata"].items() if k != "text"
                    },
                }
            )

        return {
            "success": True,
            "query": query,
            "results": formatted_results,
            "count": len(formatted_results),
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


def hybrid_search_func(chat_id: str, query: str, k: int = 5) -> Dict[str, Any]:
    """
    Hybrid search combining vector and BM25 for better results.

    Args:
        chat_id: Chat ID for context
        query: Search query
        k: Number of results

    Returns:
        Dict with search results
    """
    try:
        from langchain_huggingface.embeddings import HuggingFaceEmbeddings
        from pinecone import Pinecone

        # Initialize embeddings
        embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

        # Initialize Pinecone
        pc = Pinecone(api_key=Config.PINECONE_API_KEY)

        # Check if index exists
        if Config.PINECONE_INDEX_NAME not in [idx.name for idx in pc.list_indexes()]:
            return {
                "success": True,
                "results": [],
                "message": "No documents indexed yet",
            }

        index = pc.Index(Config.PINECONE_INDEX_NAME)

        # Vector search
        query_vector = embeddings.embed_query(query)

        filter_dict = None
        if chat_id:
            filter_dict = {"chat_id": chat_id}

        vector_results = index.query(
            vector=query_vector,
            top_k=k * 2,  # Get more for reranking
            include_metadata=True,
            filter=filter_dict,
        )

        # Simple BM25-style keyword scoring
        query_tokens = set(query.lower().split())

        scored_results = []
        for match in vector_results.get("matches", []):
            text = match["metadata"].get("text", "").lower()
            text_tokens = set(text.split())

            # Calculate keyword overlap
            keyword_score = len(query_tokens & text_tokens) / max(len(query_tokens), 1)

            # Combine scores (vector similarity + keyword overlap)
            combined_score = match["score"] * 0.7 + keyword_score * 0.3

            scored_results.append(
                {
                    "text": match["metadata"].get("text", ""),
                    "source": match["metadata"].get("source_file", "Unknown"),
                    "vector_score": match["score"],
                    "keyword_score": keyword_score,
                    "combined_score": combined_score,
                    "metadata": {
                        k: v for k, v in match["metadata"].items() if k != "text"
                    },
                }
            )

        # Sort by combined score and take top k
        scored_results.sort(key=lambda x: x["combined_score"], reverse=True)
        top_results = scored_results[:k]

        return {
            "success": True,
            "query": query,
            "results": top_results,
            "count": len(top_results),
            "search_type": "hybrid",
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


def add_to_knowledge_base_func(
    chat_id: str, text: str, source: str = "user_input", metadata: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    Add content to the knowledge base.

    Args:
        chat_id: Chat ID for context
        text: Text content to add
        source: Source identifier
        metadata: Additional metadata

    Returns:
        Dict with result status
    """
    try:
        import uuid

        from langchain_huggingface.embeddings import HuggingFaceEmbeddings
        from langchain_text_splitters import RecursiveCharacterTextSplitter
        from pinecone import Pinecone, ServerlessSpec

        # Initialize embeddings
        embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

        # Initialize Pinecone
        pc = Pinecone(api_key=Config.PINECONE_API_KEY)

        # Create index if not exists
        if Config.PINECONE_INDEX_NAME not in [idx.name for idx in pc.list_indexes()]:
            pc.create_index(
                name=Config.PINECONE_INDEX_NAME,
                dimension=384,  # MiniLM dimension
                metric="cosine",
                spec=ServerlessSpec(cloud="aws", region="us-east-1"),
            )

        index = pc.Index(Config.PINECONE_INDEX_NAME)

        # Split text into chunks
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=Config.CHUNK_SIZE,
            chunk_overlap=Config.CHUNK_OVERLAP,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

        chunks = text_splitter.split_text(text)

        # Create embeddings and upsert
        vectors = []
        for i, chunk in enumerate(chunks):
            vector = embeddings.embed_query(chunk)
            vec_metadata = {
                "text": chunk,
                "source_file": source,
                "chat_id": chat_id,
                "chunk_index": i,
                **(metadata or {}),
            }
            vectors.append(
                {
                    "id": f"{chat_id}_{uuid.uuid4().hex[:8]}_{i}",
                    "values": vector,
                    "metadata": vec_metadata,
                }
            )

        # Upsert in batches
        batch_size = 100
        for i in range(0, len(vectors), batch_size):
            batch = vectors[i : i + batch_size]
            index.upsert(vectors=batch)

        return {
            "success": True,
            "chunks_added": len(vectors),
            "source": source,
            "message": f"Added {len(vectors)} chunks to knowledge base",
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


# ============================================
# Tool Factory Functions
# ============================================


def get_search_documents_tool(chat_id: str) -> StructuredTool:
    """Get document search tool"""
    return StructuredTool.from_function(
        func=lambda **kwargs: search_documents_func(chat_id, **kwargs),
        name="search_documents",
        description="Search through uploaded documents and files using semantic search. Returns relevant text passages with source information.",
        args_schema=SearchDocumentsInput,
    )


def get_hybrid_search_tool(chat_id: str) -> StructuredTool:
    """Get hybrid search tool"""
    return StructuredTool.from_function(
        func=lambda **kwargs: hybrid_search_func(chat_id, **kwargs),
        name="hybrid_search",
        description="Search documents using both semantic similarity and keyword matching for more accurate results.",
        args_schema=HybridSearchInput,
    )


def get_rag_tools(chat_id: str) -> List[StructuredTool]:
    """Get all RAG tools"""
    return [
        get_search_documents_tool(chat_id),
        get_hybrid_search_tool(chat_id),
    ]
