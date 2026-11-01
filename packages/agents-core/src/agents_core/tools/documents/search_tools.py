import json
import logging
from typing import List, Optional

from langchain_core.tools import BaseTool, StructuredTool
from pydantic import BaseModel, Field

from agents_core.business_logic.document_search import search_documents
from agents_core.business_logic.documents import (
    DocumentAccessError,
    DocumentValidationError,
)
from agents_core.models import Chat, User, db

logger = logging.getLogger(__name__)

CITATION_INSTRUCTIONS = (
    "Answer only from these passages. After every sentence that uses a passage, "
    "add its marker exactly as shown, e.g. [^1a2b3c4d]. Never invent a marker. If "
    "the passages don't answer the question, say so instead of guessing."
)


class SearchDocumentsInput(BaseModel):
    query: str = Field(
        description=(
            "What to look for, in plain language or key terms from the documents"
        )
    )
    document_ids: Optional[List[str]] = Field(
        default=None,
        description=(
            "Limit the search to these document ids, if the user named documents"
        ),
    )
    limit: int = Field(default=8, ge=1, le=25, description="Passages to return")


def _search_documents_func(
    chat_id: str, query: str, document_ids: Optional[List[str]] = None, limit: int = 8
) -> str:
    chat = db.session.get(Chat, chat_id)
    user = db.session.get(User, chat.user_id) if chat else None
    if chat is None or user is None:
        return json.dumps({"success": False, "error": "Chat not found"})
    try:
        results = search_documents(
            user,
            query,
            team_id=chat.team_id,
            scope_type=chat.document_scope_type,
            scope_id=chat.document_scope_id,
            document_ids=document_ids,
            limit=limit,
        )
    except (DocumentAccessError, DocumentValidationError) as e:
        return json.dumps({"success": False, "error": str(e)})
    except Exception:
        logger.exception("search_documents failed for chat %s", chat_id)
        return json.dumps({"success": False, "error": "Document search failed"})

    if not results:
        return json.dumps(
            {"success": True, "message": "No matching passages in the documents"}
        )
    return json.dumps(
        {
            "success": True,
            "message": f"Found {len(results)} passages",
            "instructions": CITATION_INSTRUCTIONS,
            "citations": [
                {"marker": f"[^{result['id']}]", **result} for result in results
            ],
        }
    )


def get_document_store_tools(chat_id: str) -> List[BaseTool]:
    async def _async(**kwargs):
        return _search_documents_func(chat_id, **kwargs)

    return [
        StructuredTool.from_function(
            func=lambda **kwargs: _search_documents_func(chat_id, **kwargs),
            coroutine=_async,
            name="search_documents",
            description=(
                "Search the documents uploaded to this workspace (contracts, "
                "pleadings, emails, memos) and return passages with citation "
                "markers. Use it whenever the user asks about their documents."
            ),
            args_schema=SearchDocumentsInput,
        )
    ]
