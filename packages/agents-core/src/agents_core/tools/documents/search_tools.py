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
from agents_core.constants.documents import DOCUMENT_STATUS_READY
from agents_core.models import Chat, Document, User, db

logger = logging.getLogger(__name__)

SCOPE_CONTEXT_MAX_NAMES = 20

CITATION_INSTRUCTIONS = (
    "Answer only from these passages. After every sentence that uses a passage, "
    "add its marker exactly as shown, e.g. [^1a2b3c4d]. Never invent a marker. If "
    "the passages don't answer the question, say so instead of guessing."
)


DOCUMENT_SCOPE_PROMPT = """## Documents in this chat
This chat is about one set of documents (a {scope_type}). `search_documents` searches only them. For any question about facts, dates, parties, terms, events or correspondence, call it first and answer from its passages with their citation markers. Never ask the user to upload or paste a document before you have searched.
Documents ready to search ({count}): {names}"""


class SearchDocumentsInput(BaseModel):
    query: str = Field(
        description=(
            "What to look for, in plain language or key terms from the documents"
        )
    )
    document_ids: Optional[List[str]] = Field(
        default=None,
        description=(
            "Limit the search to these documents, by id or filename, if the user "
            "named documents"
        ),
    )
    limit: int = Field(default=8, ge=1, le=25, description="Passages to return")


def _resolve_document_refs(
    chat: Chat, user: User, refs: Optional[List[str]]
) -> Optional[List[str]]:
    """Models often pass a filename where an id is expected; map both to ids
    within the chat's own documents. None (search everything in scope) when
    nothing matches."""
    if not refs:
        return None
    documents = Document.query.filter_by(
        team_id=chat.team_id,
        scope_type=chat.document_scope_type,
        scope_id=chat.document_scope_id,
    )
    if not chat.team_id:
        documents = documents.filter_by(owner_id=user.id)
    wanted = {ref.strip().lower() for ref in refs if ref and ref.strip()}
    resolved = [
        document.id
        for document in documents.all()
        if document.id.lower() in wanted or document.filename.lower() in wanted
    ]
    return resolved or None


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
            document_ids=_resolve_document_refs(chat, user, document_ids),
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


def document_scope_context(chat_id: str) -> str:
    """Prompt text for a chat scoped to one set of documents, so the agent
    knows they exist and searches them before answering."""
    chat = db.session.get(Chat, chat_id)
    if chat is None or not chat.document_scope_type:
        return ""
    documents = Document.query.filter_by(
        team_id=chat.team_id,
        scope_type=chat.document_scope_type,
        scope_id=chat.document_scope_id,
        status=DOCUMENT_STATUS_READY,
    ).order_by(Document.created_at)
    count = documents.count()
    names = [document.filename for document in documents.limit(SCOPE_CONTEXT_MAX_NAMES)]
    if count > len(names):
        names.append(f"and {count - len(names)} more")
    return DOCUMENT_SCOPE_PROMPT.format(
        scope_type=chat.document_scope_type,
        count=count,
        names=", ".join(names) or "none yet",
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
