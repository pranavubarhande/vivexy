from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from agents_core.services.rag_service import process_rag_query


class RAGQueryInput(BaseModel):
    query: str = Field(
        ..., description="The question to ask about the uploaded documents"
    )
    files: list = Field(..., description="List of uploaded files to search through")


def query_rag(query: str, files: list):
    """Query documents using RAG."""
    try:
        result = process_rag_query(query, files)
        return {
            "success": True,
            "query": query,
            "answer": result.get("answer", "No answer found"),
            "analysis_type": result.get("analysis", "unknown"),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_rag_helper_tool(chat_id: str):
    """Get RAG helper tool for document querying."""
    return StructuredTool.from_function(
        func=lambda **kwargs: query_rag(**kwargs),
        name="query_rag",
        description="Query uploaded documents and files using Retrieval-Augmented Generation (RAG). Can analyze PDFs, CSVs, Excel files, and Word documents to answer questions about their content.",
        args_schema=RAGQueryInput,
    )
