import io
import json
import logging
import re
import secrets
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from docx import Document as WordDocument
from flask import current_app
from langchain_core.messages import HumanMessage
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font
from sqlalchemy import func

from agents_core.agents.config import AgentConfig
from agents_core.agents.llm_factory import create_llm
from agents_core.business_logic.api_keys import get_decrypted_api_keys
from agents_core.business_logic.audit import record_audit_log
from agents_core.business_logic.citation_check import (
    CITATION_MARKER_PATTERN,
    cited_ids_in_order,
)
from agents_core.business_logic.document_search import (
    chunk_citation,
    search_documents,
)
from agents_core.business_logic.documents import (
    DocumentAccessError,
    DocumentValidationError,
    authorize_scope,
)
from agents_core.business_logic.team_policy import check_team_policy
from agents_core.constants.analyses import (
    ANALYSIS_ACTIVE_STATUSES,
    ANALYSIS_ANSWER_MAX_CHARS,
    ANALYSIS_BATCH_CHARS,
    ANALYSIS_KIND_REVIEW,
    ANALYSIS_KIND_SUMMARY,
    ANALYSIS_KIND_TIMELINE,
    ANALYSIS_MAX_DOCUMENTS,
    ANALYSIS_MAX_OUTPUT_TOKENS,
    ANALYSIS_MAX_QUESTIONS,
    ANALYSIS_REQUESTS_PER_SECOND,
    ANALYSIS_REVIEW_PASSAGES,
    ANALYSIS_STATUS_CANCELLED,
    ANALYSIS_STATUS_DONE,
    ANALYSIS_STATUS_FAILED,
    ANALYSIS_STATUS_QUEUED,
    ANALYSIS_STATUS_RUNNING,
    ANALYSIS_WORKERS,
    RESULT_STATUS_DONE,
    RESULT_STATUS_FAILED,
    RESULT_STATUS_PENDING,
)
from agents_core.constants.audit_actions import (
    AUDIT_ANALYSIS_CREATED,
    AUDIT_ANALYSIS_DELETED,
    AUDIT_ANALYSIS_EXPORTED,
    AUDIT_ANALYSIS_UPDATED,
    AUDIT_TARGET_ANALYSIS,
)
from agents_core.constants.documents import DOCUMENT_STATUS_READY
from agents_core.models import (
    Document,
    DocumentAnalysis,
    DocumentAnalysisResult,
    DocumentChunk,
    LLMModel,
    TokenUsage,
    User,
    db,
)
from agents_core.schemas.document_analysis import (
    AnalysisCreate,
    AnalysisQuestionInput,
)
from agents_core.worker.dispatcher import dispatch_analysis_job

logger = logging.getLogger(__name__)

JSON_OBJECT = re.compile(r"\{.*\}", re.DOTALL)
JSON_ARRAY = re.compile(r"\[.*\]", re.DOTALL)
PASSAGE_NUMBER = re.compile(r"\d+")
PASSAGE_MARKERS = re.compile(r"\[(P\d+(?:\s*[,;]\s*P?\d+)*)\]")
SPACE_BEFORE_PUNCTUATION = re.compile(r"[ \t]+([.,;:!?])")
NOT_FOUND_ANSWER = "Not found in this document"
ANSWER_LIMIT = ANALYSIS_ANSWER_MAX_CHARS
WORKERS = ANALYSIS_WORKERS
KIND_LABELS = {
    ANALYSIS_KIND_REVIEW: "Review",
    ANALYSIS_KIND_SUMMARY: "Summary",
    ANALYSIS_KIND_TIMELINE: "Timeline",
}

REVIEW_PROMPT = (
    "You answer one question about one document for a lawyer, using only "
    'the passages below from "{filename}".\n\n'
    "Question: {question}\n\n"
    "Passages:\n{passages}\n\n"
    "Reply with only a JSON object: "
    '{{"found": true, "answer": "the answer in as few words as a lawyer '
    'would write in a review table; quote exact figures, dates and names", '
    '"citations": ["P1"]}}, citing the labels of the passages that support '
    "the answer. When the passages show the answer is no (for example the "
    "only right to terminate is for cause), that is an answer: say so and "
    "cite them. If the passages do not answer the question, reply "
    '{{"found": false, "answer": "' + NOT_FOUND_ANSWER + '", "citations": []}}. '
    "Never guess, and never mention the passages in the answer."
)


SUMMARY_LENGTH_RULES = {
    "short": "Write 3 to 5 sentences: what the document is, who the parties "
    "are, and its key terms or points.",
    "detailed": "Write 8 to 15 sentences or bullets covering the parties, "
    "purpose, every key term, obligation, date and amount, and anything "
    "unusual or risky.",
}

SUMMARY_PROMPT = (
    'Summarize {part}the document "{filename}" for a lawyer. {length_rule} '
    "Use only the passages below. End every sentence with the labels of the "
    'passages it uses, before the full stop, e.g. "...for two years [P3][P7]." '
    "Never invent a label. Write plain Markdown paragraphs or bullets, no headings.\n\n"
    "Passages:\n{passages}"
)

COMBINE_PROMPT = (
    'Combine these partial summaries of "{filename}" into one summary. '
    "{length_rule} Keep every sentence's [P] labels exactly as written and "
    "never invent one. Write plain Markdown paragraphs or bullets, no headings.\n\n"
    "Partial summaries:\n{parts}"
)

TIMELINE_PROMPT = (
    'List every dated event in these passages from "{filename}" for a '
    "lawyer's chronology, including deadlines the document sets. Use only "
    "the passages. Reply with only a JSON array, oldest first: "
    '[{{"date": "the date as written", "sortDate": "YYYY-MM-DD, YYYY-MM or '
    'YYYY, or null if unclear", "event": "what happened, in one sentence", '
    '"people": ["people or organisations involved"], "citations": ["labels '
    'of the supporting passages, e.g. P2"]}}]. Reply [] if there are none.\n\n'
    "Passages:\n{passages}"
)


class AnalysisNotFoundError(LookupError):
    pass


class AnalysisValidationError(ValueError):
    pass


# ── Access ──────────────────────────────────────────────────────────────────


def _load(analysis_id: str, user: User) -> DocumentAnalysis:
    analysis = db.session.get(DocumentAnalysis, analysis_id)
    if analysis is None:
        raise AnalysisNotFoundError("Analysis not found")
    if analysis.team_id is None and analysis.owner_id != user.id:
        raise AnalysisNotFoundError("Analysis not found")
    try:
        authorize_scope(user, analysis.team_id, analysis.scope_type, analysis.scope_id)
    except (DocumentAccessError, DocumentValidationError):
        raise AnalysisNotFoundError("Analysis not found")
    return analysis


def _scope_documents(
    user: User,
    team_id: Optional[str],
    scope_type: Optional[str],
    scope_id: Optional[str],
    document_ids: List[str],
) -> List[Document]:
    documents = Document.query.filter(
        Document.id.in_(document_ids),
        Document.team_id == team_id,
        Document.scope_type == scope_type,
        Document.scope_id == scope_id,
    )
    if not team_id:
        documents = documents.filter(Document.owner_id == user.id)
    by_id = {document.id: document for document in documents.all()}
    missing = [document_id for document_id in document_ids if document_id not in by_id]
    if missing:
        raise AnalysisValidationError(
            f"{len(missing)} of the chosen documents aren't in this workspace"
        )
    not_ready = [
        d.filename for d in by_id.values() if d.status != DOCUMENT_STATUS_READY
    ]
    if not_ready:
        raise AnalysisValidationError(
            "These documents are still processing or failed: "
            + ", ".join(sorted(not_ready)[:5])
        )
    return [by_id[document_id] for document_id in document_ids]


def _question(data: AnalysisQuestionInput) -> Dict[str, str]:
    return {"id": secrets.token_hex(4), "label": data.label, "prompt": data.prompt}


# ── Create and manage ───────────────────────────────────────────────────────


def create_analysis(
    user: User, data: AnalysisCreate, start: bool = True
) -> Dict[str, Any]:
    authorize_scope(user, data.team_id, data.scope_type, data.scope_id)
    document_ids = list(dict.fromkeys(data.document_ids))
    limit = ANALYSIS_MAX_DOCUMENTS[data.kind]
    if len(document_ids) > limit:
        raise AnalysisValidationError(
            f"A {data.kind} can cover at most {limit} documents"
        )
    if data.kind == ANALYSIS_KIND_REVIEW and not data.questions:
        raise AnalysisValidationError("Add at least one question")
    if len(data.questions) > ANALYSIS_MAX_QUESTIONS:
        raise AnalysisValidationError(
            f"A review can ask at most {ANALYSIS_MAX_QUESTIONS} questions"
        )
    model = db.session.get(LLMModel, data.model_id)
    if model is None or not model.is_active:
        raise AnalysisValidationError("Choose an available model")
    check_team_policy(data.team_id, model.id)
    documents = _scope_documents(
        user, data.team_id, data.scope_type, data.scope_id, document_ids
    )
    questions = (
        [_question(question) for question in data.questions]
        if data.kind == ANALYSIS_KIND_REVIEW
        else []
    )
    analysis = DocumentAnalysis(
        team_id=data.team_id,
        owner_id=user.id,
        scope_type=data.scope_type,
        scope_id=data.scope_id,
        kind=data.kind,
        title=data.title
        or f"{KIND_LABELS[data.kind]} of {len(documents)} "
        f"document{'s' if len(documents) != 1 else ''}",
        document_ids=document_ids,
        questions=questions,
        options={"length": data.length} if data.kind == ANALYSIS_KIND_SUMMARY else {},
        model_id=model.id,
    )
    db.session.add(analysis)
    db.session.flush()
    for document in documents:
        if questions:
            for question in questions:
                analysis.results.append(
                    DocumentAnalysisResult(
                        document_id=document.id, question_id=question["id"]
                    )
                )
        else:
            analysis.results.append(DocumentAnalysisResult(document_id=document.id))
    _audit(user, AUDIT_ANALYSIS_CREATED, analysis, documentCount=len(documents))
    db.session.commit()
    if start:
        enqueue_analysis(analysis.id)
    return get_analysis(analysis.id, user)


def _audit(user: User, action: str, analysis: DocumentAnalysis, **details) -> None:
    record_audit_log(
        user,
        action,
        AUDIT_TARGET_ANALYSIS,
        target_id=analysis.id,
        team_id=analysis.team_id,
        details={
            "kind": analysis.kind,
            "title": analysis.title,
            "scopeType": analysis.scope_type,
            "scopeId": analysis.scope_id,
            **details,
        },
        commit=False,
    )


def _requeue(analysis: DocumentAnalysis) -> None:
    should_dispatch = analysis.status not in ANALYSIS_ACTIVE_STATUSES
    analysis.status = analysis.status if not should_dispatch else ANALYSIS_STATUS_QUEUED
    analysis.completed_at = None
    analysis.error = None
    db.session.commit()
    if should_dispatch:
        enqueue_analysis(analysis.id)


def add_question(
    analysis_id: str, user: User, data: AnalysisQuestionInput
) -> Dict[str, Any]:
    analysis = _load(analysis_id, user)
    if analysis.kind != ANALYSIS_KIND_REVIEW:
        raise AnalysisValidationError("Only a review has questions")
    if len(analysis.questions) >= ANALYSIS_MAX_QUESTIONS:
        raise AnalysisValidationError(
            f"A review can ask at most {ANALYSIS_MAX_QUESTIONS} questions"
        )
    question = _question(data)
    analysis.questions = [*analysis.questions, question]
    for document_id in analysis.document_ids:
        analysis.results.append(
            DocumentAnalysisResult(document_id=document_id, question_id=question["id"])
        )
    _audit(user, AUDIT_ANALYSIS_UPDATED, analysis, addedQuestion=question["label"])
    _requeue(analysis)
    return get_analysis(analysis.id, user)


def rerun_question(
    analysis_id: str,
    question_id: str,
    user: User,
    data: Optional[AnalysisQuestionInput] = None,
) -> Dict[str, Any]:
    analysis = _load(analysis_id, user)
    questions = list(analysis.questions)
    index = next(
        (i for i, question in enumerate(questions) if question["id"] == question_id),
        None,
    )
    if index is None:
        raise AnalysisNotFoundError("Question not found")
    if data is not None:
        questions[index] = {
            **questions[index],
            "label": data.label,
            "prompt": data.prompt,
        }
        analysis.questions = questions
    DocumentAnalysisResult.query.filter_by(
        analysis_id=analysis.id, question_id=question_id
    ).update(
        {
            "status": RESULT_STATUS_PENDING,
            "answer": None,
            "found": None,
            "citations": [],
            "error": None,
        }
    )
    _audit(
        user, AUDIT_ANALYSIS_UPDATED, analysis, rerunQuestion=questions[index]["label"]
    )
    _requeue(analysis)
    return get_analysis(analysis.id, user)


def remove_question(analysis_id: str, question_id: str, user: User) -> Dict[str, Any]:
    analysis = _load(analysis_id, user)
    questions = [q for q in analysis.questions if q["id"] != question_id]
    if len(questions) == len(analysis.questions):
        raise AnalysisNotFoundError("Question not found")
    if not questions:
        raise AnalysisValidationError("A review needs at least one question")
    analysis.questions = questions
    DocumentAnalysisResult.query.filter_by(
        analysis_id=analysis.id, question_id=question_id
    ).delete()
    _audit(user, AUDIT_ANALYSIS_UPDATED, analysis, removedQuestion=question_id)
    db.session.commit()
    return get_analysis(analysis.id, user)


def retry_failed(analysis_id: str, user: User) -> Dict[str, Any]:
    analysis = _load(analysis_id, user)
    DocumentAnalysisResult.query.filter_by(
        analysis_id=analysis.id, status=RESULT_STATUS_FAILED
    ).update({"status": RESULT_STATUS_PENDING, "error": None})
    _requeue(analysis)
    return get_analysis(analysis.id, user)


def cancel_analysis(analysis_id: str, user: User) -> Dict[str, Any]:
    analysis = _load(analysis_id, user)
    if analysis.status in ANALYSIS_ACTIVE_STATUSES:
        analysis.status = ANALYSIS_STATUS_CANCELLED
        analysis.completed_at = datetime.utcnow()
        db.session.commit()
    return get_analysis(analysis.id, user)


def delete_analysis(analysis_id: str, user: User) -> None:
    analysis = _load(analysis_id, user)
    _audit(user, AUDIT_ANALYSIS_DELETED, analysis)
    db.session.delete(analysis)
    db.session.commit()


# ── Read ────────────────────────────────────────────────────────────────────


def _progress(analysis_ids: List[str]) -> Dict[str, Dict[str, int]]:
    rows = (
        db.session.query(
            DocumentAnalysisResult.analysis_id,
            DocumentAnalysisResult.status,
            func.count(DocumentAnalysisResult.id),
        )
        .filter(DocumentAnalysisResult.analysis_id.in_(analysis_ids))
        .group_by(DocumentAnalysisResult.analysis_id, DocumentAnalysisResult.status)
        .all()
    )
    progress: Dict[str, Dict[str, int]] = {
        analysis_id: {"total": 0, "done": 0, "failed": 0}
        for analysis_id in analysis_ids
    }
    for analysis_id, status, count in rows:
        progress[analysis_id]["total"] += count
        if status == RESULT_STATUS_DONE:
            progress[analysis_id]["done"] += count
        elif status == RESULT_STATUS_FAILED:
            progress[analysis_id]["failed"] += count
    return progress


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def analysis_to_dict(
    analysis: DocumentAnalysis, progress: Dict[str, int]
) -> Dict[str, Any]:
    return {
        "id": analysis.id,
        "teamId": analysis.team_id,
        "ownerId": analysis.owner_id,
        "scopeType": analysis.scope_type,
        "scopeId": analysis.scope_id,
        "kind": analysis.kind,
        "title": analysis.title,
        "status": analysis.status,
        "documentIds": analysis.document_ids,
        "questions": analysis.questions,
        "options": analysis.options or {},
        "modelId": analysis.model_id,
        "error": analysis.error,
        "progress": progress,
        "inputTokens": analysis.input_tokens,
        "outputTokens": analysis.output_tokens,
        "createdAt": _iso(analysis.created_at),
        "updatedAt": _iso(analysis.updated_at),
        "completedAt": _iso(analysis.completed_at),
    }


def _result_to_dict(result: DocumentAnalysisResult) -> Dict[str, Any]:
    return {
        "id": result.id,
        "documentId": result.document_id,
        "questionId": result.question_id,
        "status": result.status,
        "answer": result.answer,
        "found": result.found,
        "items": result.items,
        "citations": result.citations or [],
        "error": result.error,
    }


def _timeline_events(
    results: List[DocumentAnalysisResult], filenames: Dict[str, str]
) -> List[Dict[str, Any]]:
    events = []
    for result in results:
        citations = {citation["id"]: citation for citation in result.citations or []}
        for item in result.items or []:
            events.append(
                {
                    **item,
                    "documentId": result.document_id,
                    "filename": filenames.get(result.document_id),
                    "citations": [
                        citations[citation_id]
                        for citation_id in item.get("citationIds", [])
                        if citation_id in citations
                    ],
                }
            )
    return sorted(
        events,
        key=lambda event: (event.get("sortDate") is None, event.get("sortDate") or ""),
    )


def get_analysis(analysis_id: str, user: User) -> Dict[str, Any]:
    analysis = _load(analysis_id, user)
    documents = Document.query.filter(Document.id.in_(analysis.document_ids)).all()
    filenames = {document.id: document.filename for document in documents}
    order = {
        document_id: index for index, document_id in enumerate(analysis.document_ids)
    }
    results = sorted(
        analysis.results, key=lambda result: order.get(result.document_id, len(order))
    )
    payload = analysis_to_dict(analysis, _progress([analysis.id])[analysis.id])
    payload["documents"] = [
        {
            "id": document_id,
            "filename": filenames.get(document_id, "Deleted document"),
            "available": document_id in filenames,
        }
        for document_id in analysis.document_ids
    ]
    payload["results"] = [_result_to_dict(result) for result in results]
    if analysis.kind == ANALYSIS_KIND_TIMELINE:
        payload["events"] = _timeline_events(results, filenames)
    return payload


def list_analyses(
    user: User,
    team_id: Optional[str],
    scope_type: Optional[str],
    scope_id: Optional[str],
    kind: Optional[str] = None,
) -> List[Dict[str, Any]]:
    authorize_scope(user, team_id, scope_type, scope_id)
    analyses = DocumentAnalysis.query.filter(
        DocumentAnalysis.team_id == team_id,
        DocumentAnalysis.scope_type == scope_type,
        DocumentAnalysis.scope_id == scope_id,
    )
    if not team_id:
        analyses = analyses.filter(DocumentAnalysis.owner_id == user.id)
    if kind:
        analyses = analyses.filter(DocumentAnalysis.kind == kind)
    rows = analyses.order_by(DocumentAnalysis.created_at.desc()).limit(200).all()
    progress = _progress([analysis.id for analysis in rows])
    return [analysis_to_dict(analysis, progress[analysis.id]) for analysis in rows]


# ── Run ─────────────────────────────────────────────────────────────────────


def enqueue_analysis(analysis_id: str) -> None:
    if dispatch_analysis_job(analysis_id=analysis_id):
        return
    app = current_app._get_current_object()

    def run():
        with app.app_context():
            run_analysis(analysis_id)

    threading.Thread(target=run, name=f"analysis-{analysis_id}", daemon=True).start()


class _Usage:
    def __init__(self):
        self.lock = threading.Lock()
        self.input_tokens = 0
        self.output_tokens = 0

    def add(self, response: Any) -> None:
        meta = getattr(response, "usage_metadata", None) or {}
        with self.lock:
            self.input_tokens += meta.get("input_tokens", 0) or 0
            self.output_tokens += meta.get("output_tokens", 0) or 0


def _text(response: Any) -> str:
    content = response.content
    if isinstance(content, list):
        content = "".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
        )
    return content or ""


def _ask(llm: Any, usage: _Usage, prompt: str) -> str:
    response = llm.invoke([HumanMessage(content=prompt)])
    usage.add(response)
    return _text(response)


def _parse_json(raw: str, pattern: re.Pattern) -> Any:
    match = pattern.search(raw)
    if not match:
        raise ValueError("The model did not return JSON")
    return json.loads(match.group(0))


def _cited(values: Any, passages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Passages the model cited by label (P1, P2...). Models copy short
    labels reliably; long hex ids come back garbled."""
    found: List[Dict[str, Any]] = []
    for value in values if isinstance(values, list) else []:
        for number in PASSAGE_NUMBER.findall(str(value)):
            index = int(number) - 1
            if 0 <= index < len(passages) and passages[index] not in found:
                found.append(passages[index])
    return found


def _passage_lines(passages: List[Dict[str, Any]], start: int = 1) -> str:
    return "\n".join(
        f"[P{start + index}] (page {passage['pageNumber']}) "
        f"{' '.join(passage['quote'].split())}"
        for index, passage in enumerate(passages)
    )


def _labels_to_markers(text: str, passages: List[Dict[str, Any]]) -> str:
    """Turns [P3] or [P3, P7] labels into [^id] citation markers and drops
    labels that match no passage."""

    def markers(match: re.Match) -> str:
        return "".join(
            f"[^{passages[int(number) - 1]['id']}]"
            for number in PASSAGE_NUMBER.findall(match.group(1))
            if 0 < int(number) <= len(passages)
        )

    return PASSAGE_MARKERS.sub(markers, text)


def _document_passages(document: Document) -> List[Dict[str, Any]]:
    chunks = (
        DocumentChunk.query.filter_by(document_id=document.id)
        .order_by(DocumentChunk.page_number, DocumentChunk.chunk_index)
        .all()
    )
    return [chunk_citation(chunk, document) for chunk in chunks]


def _batches(passages: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    batches: List[List[Dict[str, Any]]] = [[]]
    size = 0
    for passage in passages:
        length = len(passage["quote"])
        if batches[-1] and size + length > ANALYSIS_BATCH_CHARS:
            batches.append([])
            size = 0
        batches[-1].append(passage)
        size += length
    return [batch for batch in batches if batch]


def _review_cell(
    llm: Any,
    usage: _Usage,
    user: User,
    analysis: DocumentAnalysis,
    document: Document,
    question: Dict[str, str],
) -> Tuple[str, bool, List[Dict[str, Any]]]:
    passages = search_documents(
        user,
        question["prompt"],
        team_id=analysis.team_id,
        scope_type=analysis.scope_type,
        scope_id=analysis.scope_id,
        document_ids=[document.id],
        limit=ANALYSIS_REVIEW_PASSAGES,
    )
    if not passages:
        return NOT_FOUND_ANSWER, False, []
    reply = _parse_json(
        _ask(
            llm,
            usage,
            REVIEW_PROMPT.format(
                filename=document.filename,
                question=question["prompt"],
                passages=_passage_lines(passages),
            ),
        ),
        JSON_OBJECT,
    )
    found = bool(reply.get("found"))
    answer = str(reply.get("answer") or "").strip()[:ANSWER_LIMIT]
    if not found or not answer:
        return NOT_FOUND_ANSWER, False, []
    return answer, True, _cited(reply.get("citations"), passages)


def _summary(
    llm: Any, usage: _Usage, document: Document, length: str
) -> Tuple[str, List[Dict[str, Any]]]:
    passages = _document_passages(document)
    if not passages:
        return "This document has no text to summarize.", []
    by_id = {passage["id"]: passage for passage in passages}
    length_rule = SUMMARY_LENGTH_RULES.get(length, SUMMARY_LENGTH_RULES["short"])
    batches = _batches(passages)
    starts = [
        sum(len(batch) for batch in batches[:index]) + 1
        for index in range(len(batches))
    ]
    parts = [
        _ask(
            llm,
            usage,
            SUMMARY_PROMPT.format(
                part=(
                    f"part {index + 1} of {len(batches)} of "
                    if len(batches) > 1
                    else ""
                ),
                filename=document.filename,
                length_rule=length_rule,
                passages=_passage_lines(batch, starts[index]),
            ),
        )
        for index, batch in enumerate(batches)
    ]
    text = parts[0]
    if len(parts) > 1:
        text = _ask(
            llm,
            usage,
            COMBINE_PROMPT.format(
                filename=document.filename,
                length_rule=length_rule,
                parts="\n\n---\n\n".join(parts),
            ),
        )
    text = _labels_to_markers(CITATION_MARKER_PATTERN.sub("", text.strip()), passages)
    text = SPACE_BEFORE_PUNCTUATION.sub(r"\1", text)
    return text, [by_id[marker] for marker in cited_ids_in_order(text)]


def _timeline(
    llm: Any, usage: _Usage, document: Document
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    passages = _document_passages(document)
    events: List[Dict[str, Any]] = []
    for batch in _batches(passages):
        reply = _parse_json(
            _ask(
                llm,
                usage,
                TIMELINE_PROMPT.format(
                    filename=document.filename, passages=_passage_lines(batch)
                ),
            ),
            JSON_ARRAY,
        )
        for item in reply if isinstance(reply, list) else []:
            if not isinstance(item, dict) or not item.get("event"):
                continue
            sort_date = item.get("sortDate")
            events.append(
                {
                    "date": str(item.get("date") or "").strip() or None,
                    "sortDate": (
                        sort_date
                        if isinstance(sort_date, str)
                        and re.fullmatch(r"\d{4}(-\d{2}(-\d{2})?)?", sort_date)
                        else None
                    ),
                    "event": str(item["event"]).strip()[:ANSWER_LIMIT],
                    "people": [
                        str(person)
                        for person in item.get("people") or []
                        if isinstance(person, (str, int))
                    ][:10],
                    "citationIds": [
                        passage["id"]
                        for passage in _cited(item.get("citations"), batch)
                    ],
                }
            )
    by_id = {passage["id"]: passage for passage in passages}
    used = dict.fromkeys(marker for event in events for marker in event["citationIds"])
    return events, [by_id[marker] for marker in used]


def _process_result(result_id: str, llm: Any, usage: _Usage) -> None:
    result = db.session.get(DocumentAnalysisResult, result_id)
    if result is None or result.status != RESULT_STATUS_PENDING:
        return
    analysis = result.analysis
    db.session.refresh(analysis)
    if analysis.status == ANALYSIS_STATUS_CANCELLED:
        return
    owner = db.session.get(User, analysis.owner_id)
    document = db.session.get(Document, result.document_id)
    try:
        if document is None:
            raise ValueError("The document was deleted")
        if analysis.kind == ANALYSIS_KIND_REVIEW:
            question = next(
                (q for q in analysis.questions if q["id"] == result.question_id), None
            )
            if question is None:
                return
            answer, found, citations = _review_cell(
                llm, usage, owner, analysis, document, question
            )
            result.answer, result.found, result.citations = answer, found, citations
        elif analysis.kind == ANALYSIS_KIND_SUMMARY:
            text, citations = _summary(
                llm, usage, document, (analysis.options or {}).get("length", "short")
            )
            result.answer, result.found, result.citations = text, True, citations
        else:
            events, citations = _timeline(llm, usage, document)
            result.items, result.found, result.citations = (
                events,
                bool(events),
                citations,
            )
        result.status = RESULT_STATUS_DONE
        result.error = None
    except Exception as error:
        logger.warning("Analysis cell %s failed: %s", result_id, error)
        result.status = RESULT_STATUS_FAILED
        result.error = (
            str(error)
            if isinstance(error, ValueError)
            else "The model could not finish this cell"
        )
    db.session.commit()


def _build_llm(analysis: DocumentAnalysis) -> Any:
    model = db.session.get(LLMModel, analysis.model_id) if analysis.model_id else None
    if model is None:
        raise ValueError("The analysis model is no longer available")
    config = replace(
        AgentConfig.from_env(
            provider=model.provider,
            model=model.model_id,
            user_api_keys=get_decrypted_api_keys(analysis.owner_id),
        ),
        temperature=0,
        max_tokens=ANALYSIS_MAX_OUTPUT_TOKENS,
    )
    return create_llm(config, requests_per_second=ANALYSIS_REQUESTS_PER_SECOND)


def _record_usage(analysis: DocumentAnalysis, usage: _Usage) -> None:
    if not usage.input_tokens and not usage.output_tokens:
        return
    model = db.session.get(LLMModel, analysis.model_id) if analysis.model_id else None
    input_cost = (usage.input_tokens / 1_000_000) * ((model and model.input_cost) or 0)
    output_cost = (usage.output_tokens / 1_000_000) * (
        (model and model.output_cost) or 0
    )
    analysis.input_tokens += usage.input_tokens
    analysis.output_tokens += usage.output_tokens
    db.session.add(
        TokenUsage(
            user_id=analysis.owner_id,
            team_id=analysis.team_id,
            model_id=analysis.model_id,
            model_name=model.name if model else None,
            provider=model.provider if model else None,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            total_tokens=usage.input_tokens + usage.output_tokens,
            input_cost_usd=input_cost,
            output_cost_usd=output_cost,
            total_cost_usd=input_cost + output_cost,
        )
    )


def _pending_ids(analysis_id: str) -> List[str]:
    return [
        result_id
        for (result_id,) in db.session.query(DocumentAnalysisResult.id)
        .filter_by(analysis_id=analysis_id, status=RESULT_STATUS_PENDING)
        .all()
    ]


def run_analysis(analysis_id: str) -> None:
    """Fill every pending cell, a few at a time, then settle the status. Cells
    added while it runs are picked up before it finishes."""
    analysis = db.session.get(DocumentAnalysis, analysis_id)
    if analysis is None or analysis.status == ANALYSIS_STATUS_CANCELLED:
        return
    analysis.status = ANALYSIS_STATUS_RUNNING
    db.session.commit()
    usage = _Usage()
    try:
        llm = _build_llm(analysis)
    except Exception as error:
        analysis.status = ANALYSIS_STATUS_FAILED
        analysis.error = (
            str(error)
            if isinstance(error, ValueError)
            else ("The model could not be started")
        )
        analysis.completed_at = datetime.utcnow()
        db.session.commit()
        return
    app = current_app._get_current_object()

    def work(result_id: str) -> None:
        with app.app_context():
            try:
                _process_result(result_id, llm, usage)
            finally:
                db.session.remove()

    while True:
        pending = _pending_ids(analysis_id)
        db.session.refresh(analysis)
        if not pending or analysis.status == ANALYSIS_STATUS_CANCELLED:
            break
        if WORKERS <= 1:
            for result_id in pending:
                _process_result(result_id, llm, usage)
            continue
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            list(pool.map(work, pending))

    db.session.refresh(analysis)
    _record_usage(analysis, usage)
    if analysis.status != ANALYSIS_STATUS_CANCELLED:
        progress = _progress([analysis.id])[analysis.id]
        failed_all = progress["total"] and progress["failed"] == progress["total"]
        analysis.status = ANALYSIS_STATUS_FAILED if failed_all else ANALYSIS_STATUS_DONE
        analysis.error = (
            f"{progress['failed']} of {progress['total']} could not be completed"
            if progress["failed"]
            else None
        )
        analysis.completed_at = datetime.utcnow()
    db.session.commit()


# ── Export ──────────────────────────────────────────────────────────────────


def _page(citation: Dict[str, Any]) -> str:
    return f"p. {citation['pageNumber']}" if citation.get("paginated") else ""


def _review_workbook(payload: Dict[str, Any]) -> bytes:
    workbook = Workbook()
    grid = workbook.active
    grid.title = "Review"
    questions = payload["questions"]
    grid.append(["Document", *[question["label"] for question in questions]])
    cells = {
        (result["documentId"], result["questionId"]): result
        for result in payload["results"]
    }
    sources = workbook.create_sheet("Sources")
    sources.append(["Document", "Question", "Answer", "Page", "Passage"])
    for document in payload["documents"]:
        row = [document["filename"]]
        for question in questions:
            result = cells.get((document["id"], question["id"]), {})
            pages = ", ".join(
                filter(None, (_page(c) for c in result.get("citations", [])))
            )
            answer = result.get("answer") or result.get("error") or ""
            row.append(f"{answer} ({pages})" if pages else answer)
            for citation in result.get("citations", []):
                sources.append(
                    [
                        document["filename"],
                        question["label"],
                        answer,
                        _page(citation),
                        citation["quote"],
                    ]
                )
        grid.append(row)
    for sheet in (grid, sources):
        for cell in sheet[1]:
            cell.font = Font(bold=True)
        for column in sheet.columns:
            sheet.column_dimensions[column[0].column_letter].width = 40
            for cell in column:
                cell.alignment = Alignment(wrap_text=True, vertical="top")
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _timeline_workbook(payload: Dict[str, Any]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Timeline"
    sheet.append(["Date", "Event", "People", "Document", "Page", "Passage"])
    for event in payload["events"]:
        citation = (event.get("citations") or [{}])[0]
        sheet.append(
            [
                event.get("date") or event.get("sortDate") or "Undated",
                event.get("event"),
                ", ".join(event.get("people") or []),
                event.get("filename"),
                _page(citation) if citation else "",
                citation.get("quote", ""),
            ]
        )
    for cell in sheet[1]:
        cell.font = Font(bold=True)
    for column in sheet.columns:
        sheet.column_dimensions[column[0].column_letter].width = 36
        for cell in column:
            cell.alignment = Alignment(wrap_text=True, vertical="top")
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _summary_document(payload: Dict[str, Any]) -> bytes:
    word = WordDocument()
    word.add_heading(payload["title"], level=1)
    filenames = {
        document["id"]: document["filename"] for document in payload["documents"]
    }
    for result in payload["results"]:
        word.add_heading(filenames.get(result["documentId"], "Document"), level=2)
        citations = {citation["id"]: citation for citation in result["citations"]}
        numbers = {
            marker: index + 1
            for index, marker in enumerate(cited_ids_in_order(result["answer"] or ""))
            if marker in citations
        }
        text = CITATION_MARKER_PATTERN.sub(
            lambda match: (
                f"[{numbers[match.group(1)]}]" if match.group(1) in numbers else ""
            ),
            result["answer"] or result.get("error") or "",
        )
        for paragraph in [p for p in text.split("\n") if p.strip()]:
            word.add_paragraph(paragraph.lstrip("-* ").strip())
        if numbers:
            word.add_paragraph("Sources", style="Heading 3")
            for marker, number in numbers.items():
                citation = citations[marker]
                word.add_paragraph(
                    f"[{number}] {citation['filename']} {_page(citation)}: "
                    f"“{' '.join(citation['quote'].split())[:400]}”"
                )
    buffer = io.BytesIO()
    word.save(buffer)
    return buffer.getvalue()


EXPORT_FORMATS = {
    ANALYSIS_KIND_REVIEW: (
        _review_workbook,
        "xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
    ANALYSIS_KIND_TIMELINE: (
        _timeline_workbook,
        "xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
    ANALYSIS_KIND_SUMMARY: (
        _summary_document,
        "docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
}


def export_analysis(analysis_id: str, user: User) -> Tuple[bytes, str, str]:
    payload = get_analysis(analysis_id, user)
    build, extension, mimetype = EXPORT_FORMATS[payload["kind"]]
    analysis = db.session.get(DocumentAnalysis, analysis_id)
    _audit(user, AUDIT_ANALYSIS_EXPORTED, analysis, format=extension)
    db.session.commit()
    safe_title = re.sub(r"[^A-Za-z0-9 _-]+", "", payload["title"]).strip() or "analysis"
    return build(payload), f"{safe_title}.{extension}", mimetype
