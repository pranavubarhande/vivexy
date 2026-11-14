import logging
import re
import threading
from functools import partial
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from flask import current_app

from agents_core.business_logic.audit import record_audit_log
from agents_core.business_logic.citation_check import (
    CITATION_MARKER_PATTERN,
    cited_ids_in_order,
)
from agents_core.business_logic.document_analyses import (
    AnalysisValidationError,
    create_analysis,
    get_analysis,
    run_analysis,
    scope_documents,
)
from agents_core.business_logic.document_search import search_documents
from agents_core.business_logic.documents import (
    DocumentAccessError,
    DocumentValidationError,
    authorize_scope,
)
from agents_core.business_logic.llm_batch import (
    Usage,
    ask,
    build_batch_llm,
    record_token_usage,
)
from agents_core.business_logic.passages import (
    labels_to_markers,
    passage_lines,
)
from agents_core.business_logic.prompts import PromptValidationError, fill_template
from agents_core.business_logic.team_policy import check_team_policy
from agents_core.business_logic.word_export import build_cited_document
from agents_core.constants.audit_actions import (
    AUDIT_TARGET_WORKFLOW_RUN,
    AUDIT_WORKFLOW_DELETED,
    AUDIT_WORKFLOW_EXPORTED,
    AUDIT_WORKFLOW_STARTED,
    AUDIT_WORKFLOW_UPDATED,
)
from agents_core.constants.workflows import (
    DOCUMENTS_NONE,
    DOCUMENTS_REQUIRED,
    STEP_KIND_REVIEW,
    STEP_KIND_SUMMARY,
    STEP_KIND_WRITE,
    STEP_STATUS_DONE,
    STEP_STATUS_FAILED,
    STEP_STATUS_PENDING,
    STEP_STATUS_RUNNING,
    WORKFLOW_ACTIVE_STATUSES,
    WORKFLOW_CONTEXT_MAX_CHARS,
    WORKFLOW_MAX_DOCUMENTS,
    WORKFLOW_MAX_OUTPUT_TOKENS,
    WORKFLOW_MIN_PASSAGES_PER_DOCUMENT,
    WORKFLOW_PER_DOCUMENT_SEARCH_LIMIT,
    WORKFLOW_REQUESTS_PER_SECOND,
    WORKFLOW_SEARCH_PASSAGES,
    WORKFLOW_STATUS_CANCELLED,
    WORKFLOW_STATUS_DONE,
    WORKFLOW_STATUS_FAILED,
    WORKFLOW_STATUS_QUEUED,
    WORKFLOW_STATUS_RUNNING,
    WORKFLOW_STATUS_WAITING,
)
from agents_core.library.registry import workflow_definitions
from agents_core.library.types import WorkflowDefinition, WorkflowStep
from agents_core.models import LLMModel, User, WorkflowRun, WorkflowRunStep, db
from agents_core.schemas.document_analysis import AnalysisCreate
from agents_core.schemas.workflow import WorkflowStartInput
from agents_core.worker.dispatcher import dispatch_workflow_job

logger = logging.getLogger(__name__)

TEMPLATE_VARIABLE = re.compile(r"\{\{\s*(inputs|steps)\.([a-z][a-z0-9_]*)\s*\}\}")

WRITE_PROMPT = (
    "You are carrying out one step of a guided workflow for a professional."
    "\n\nStep: {title}\n\nInstructions:\n{instructions}\n\n{sources}"
    "Write the result in Markdown. Be specific and concise; no preamble."
)
SOURCES_WITH_PASSAGES = (
    "Use only these passages from the documents for facts. End every sentence "
    "that uses one with its labels before the full stop, e.g. "
    '"...within thirty days [P2][P5]." Never invent a label, and never mention '
    'the passages themselves. If they do not hold what you need, say "Not '
    'found in the documents".\n\nPassages:\n{passages}\n\n'
)
SOURCES_NO_PASSAGES = (
    "No document passages were found for this step. Do not state facts about "
    "the documents; say what is missing instead.\n\n"
)


class WorkflowNotFoundError(LookupError):
    pass


class WorkflowValidationError(ValueError):
    pass


# ── Definitions ─────────────────────────────────────────────────────────────


def _definition(key: str) -> WorkflowDefinition:
    definition = workflow_definitions().get(key)
    if definition is None:
        raise WorkflowNotFoundError("Workflow not found")
    return definition


def definition_to_dict(definition: WorkflowDefinition) -> Dict[str, Any]:
    return {
        "key": definition.key,
        "name": definition.name,
        "description": definition.description,
        "category": definition.category,
        "documents": definition.documents,
        "documentsHint": definition.documents_hint,
        "maxDocuments": WORKFLOW_MAX_DOCUMENTS,
        "inputs": [field.to_dict() for field in definition.inputs],
        "steps": [
            {
                "key": step.key,
                "title": step.title,
                "kind": step.kind,
                "pause": step.pause,
                "description": step.description,
            }
            for step in definition.steps
        ],
    }


def list_workflows() -> List[Dict[str, Any]]:
    return [definition_to_dict(d) for d in workflow_definitions().values()]


# ── Access ──────────────────────────────────────────────────────────────────


def _load(run_id: str, user: User) -> WorkflowRun:
    run = db.session.get(WorkflowRun, run_id)
    if run is None or (run.team_id is None and run.owner_id != user.id):
        raise WorkflowNotFoundError("Workflow run not found")
    try:
        authorize_scope(user, run.team_id, run.scope_type, run.scope_id)
    except (DocumentAccessError, DocumentValidationError):
        raise WorkflowNotFoundError("Workflow run not found")
    return run


def _audit(user: User, action: str, run: WorkflowRun, **details) -> None:
    record_audit_log(
        user,
        action,
        AUDIT_TARGET_WORKFLOW_RUN,
        target_id=run.id,
        team_id=run.team_id,
        details={
            "workflow": run.workflow_key,
            "title": run.title,
            "scopeType": run.scope_type,
            "scopeId": run.scope_id,
            **details,
        },
        commit=False,
    )


# ── Start and manage ────────────────────────────────────────────────────────


def start_workflow(
    user: User, data: WorkflowStartInput, start: bool = True
) -> Dict[str, Any]:
    authorize_scope(user, data.team_id, data.scope_type, data.scope_id)
    definition = _definition(data.workflow_key)
    document_ids = list(dict.fromkeys(data.document_ids))
    if definition.documents == DOCUMENTS_REQUIRED and not document_ids:
        raise WorkflowValidationError("Choose at least one document")
    if definition.documents == DOCUMENTS_NONE and document_ids:
        raise WorkflowValidationError("This workflow does not use documents")
    if len(document_ids) > WORKFLOW_MAX_DOCUMENTS:
        raise WorkflowValidationError(
            f"A workflow can use at most {WORKFLOW_MAX_DOCUMENTS} documents"
        )
    try:
        scope_documents(
            user, data.team_id, data.scope_type, data.scope_id, document_ids
        )
    except AnalysisValidationError as error:
        raise WorkflowValidationError(str(error))
    fields = [field.to_dict() for field in definition.inputs]
    try:
        fill_template("", fields, data.inputs)
    except PromptValidationError as error:
        raise WorkflowValidationError(str(error))
    model = db.session.get(LLMModel, data.model_id)
    if model is None or not model.is_active:
        raise WorkflowValidationError("Choose an available model")
    check_team_policy(data.team_id, model.id)

    run = WorkflowRun(
        team_id=data.team_id,
        owner_id=user.id,
        scope_type=data.scope_type,
        scope_id=data.scope_id,
        workflow_key=definition.key,
        title=data.title or definition.name,
        inputs={
            field["key"]: (data.inputs.get(field["key"]) or "").strip()
            for field in fields
        },
        document_ids=document_ids,
        model_id=model.id,
    )
    db.session.add(run)
    db.session.flush()
    for position, step in enumerate(definition.steps):
        run.steps.append(WorkflowRunStep(step_key=step.key, position=position))
    _audit(user, AUDIT_WORKFLOW_STARTED, run, documentCount=len(document_ids))
    db.session.commit()
    if start:
        enqueue_workflow(run.id)
    return get_run(run.id, user)


def _queue(run: WorkflowRun) -> None:
    if run.status in WORKFLOW_ACTIVE_STATUSES:
        db.session.commit()
        return
    run.status = WORKFLOW_STATUS_QUEUED
    run.error = None
    run.completed_at = None
    db.session.commit()
    enqueue_workflow(run.id)


def _reset_from(run: WorkflowRun, position: int) -> None:
    for step in run.steps:
        if step.position >= position:
            step.status = STEP_STATUS_PENDING
            step.output = None
            step.citations = []
            step.analysis_id = None
            step.edited = False
            step.error = None
            step.completed_at = None


def _step_row(run: WorkflowRun, step_key: str) -> WorkflowRunStep:
    row = next((step for step in run.steps if step.step_key == step_key), None)
    if row is None:
        raise WorkflowNotFoundError("Step not found")
    return row


def _ensure_idle(run: WorkflowRun) -> None:
    if run.status in WORKFLOW_ACTIVE_STATUSES:
        raise WorkflowValidationError("Wait for the current step to finish")


def continue_run(run_id: str, user: User) -> Dict[str, Any]:
    """Runs the remaining steps, retrying a failed one."""
    run = _load(run_id, user)
    _ensure_idle(run)
    for step in run.steps:
        if step.status == STEP_STATUS_FAILED:
            step.status = STEP_STATUS_PENDING
            step.error = None
    if not any(step.status == STEP_STATUS_PENDING for step in run.steps):
        raise WorkflowValidationError("Every step is already done")
    _queue(run)
    return get_run(run.id, user)


def rerun_step(run_id: str, step_key: str, user: User) -> Dict[str, Any]:
    """Runs a step again, and every step after it."""
    run = _load(run_id, user)
    _ensure_idle(run)
    row = _step_row(run, step_key)
    _reset_from(run, row.position)
    _audit(user, AUDIT_WORKFLOW_UPDATED, run, rerunStep=step_key)
    _queue(run)
    return get_run(run.id, user)


def edit_step(run_id: str, step_key: str, user: User, output: str) -> Dict[str, Any]:
    """Replaces a finished step's output. Later steps are cleared, and the run
    waits so the user can continue from the edited step."""
    run = _load(run_id, user)
    _ensure_idle(run)
    row = _step_row(run, step_key)
    if row.status != STEP_STATUS_DONE:
        raise WorkflowValidationError("Only a finished step can be edited")
    kept = set(cited_ids_in_order(output))
    row.output = output.strip()
    row.citations = [c for c in row.citations or [] if c["id"] in kept]
    row.edited = True
    _reset_from(run, row.position + 1)
    later = any(step.position > row.position for step in run.steps)
    run.status = WORKFLOW_STATUS_WAITING if later else WORKFLOW_STATUS_DONE
    _audit(user, AUDIT_WORKFLOW_UPDATED, run, editedStep=step_key)
    db.session.commit()
    return get_run(run.id, user)


def cancel_run(run_id: str, user: User) -> Dict[str, Any]:
    run = _load(run_id, user)
    if run.status in (*WORKFLOW_ACTIVE_STATUSES, WORKFLOW_STATUS_WAITING):
        run.status = WORKFLOW_STATUS_CANCELLED
        run.completed_at = datetime.utcnow()
        db.session.commit()
    return get_run(run.id, user)


def delete_run(run_id: str, user: User) -> None:
    run = _load(run_id, user)
    _audit(user, AUDIT_WORKFLOW_DELETED, run)
    db.session.delete(run)
    db.session.commit()


# ── Read ────────────────────────────────────────────────────────────────────


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def _run_to_dict(run: WorkflowRun, definition: Optional[WorkflowDefinition]):
    fields = {f.key: f.label for f in definition.inputs} if definition else {}
    done = sum(1 for step in run.steps if step.status == STEP_STATUS_DONE)
    return {
        "id": run.id,
        "teamId": run.team_id,
        "ownerId": run.owner_id,
        "scopeType": run.scope_type,
        "scopeId": run.scope_id,
        "workflowKey": run.workflow_key,
        "workflowName": definition.name if definition else run.workflow_key,
        "title": run.title,
        "status": run.status,
        "inputs": [
            {"key": key, "label": fields.get(key, key), "value": value}
            for key, value in (run.inputs or {}).items()
        ],
        "documentIds": run.document_ids,
        "modelId": run.model_id,
        "error": run.error,
        "progress": {"total": len(run.steps), "done": done},
        "inputTokens": run.input_tokens,
        "outputTokens": run.output_tokens,
        "createdAt": _iso(run.created_at),
        "updatedAt": _iso(run.updated_at),
        "completedAt": _iso(run.completed_at),
    }


def get_run(run_id: str, user: User) -> Dict[str, Any]:
    run = _load(run_id, user)
    definition = workflow_definitions().get(run.workflow_key)
    steps_by_key = {step.key: step for step in definition.steps} if definition else {}
    payload = _run_to_dict(run, definition)
    payload["steps"] = [
        {
            "key": row.step_key,
            "title": (
                steps_by_key[row.step_key].title
                if row.step_key in steps_by_key
                else row.step_key
            ),
            "kind": (
                steps_by_key[row.step_key].kind
                if row.step_key in steps_by_key
                else STEP_KIND_WRITE
            ),
            "pause": bool(
                row.step_key in steps_by_key and steps_by_key[row.step_key].pause
            ),
            "description": (
                steps_by_key[row.step_key].description
                if row.step_key in steps_by_key
                else ""
            ),
            "status": row.status,
            "output": row.output,
            "citations": row.citations or [],
            "analysisId": row.analysis_id,
            "edited": row.edited,
            "error": row.error,
            "completedAt": _iso(row.completed_at),
        }
        for row in run.steps
    ]
    return payload


def list_runs(
    user: User,
    team_id: Optional[str],
    scope_type: Optional[str],
    scope_id: Optional[str],
    workflow_key: Optional[str] = None,
) -> List[Dict[str, Any]]:
    authorize_scope(user, team_id, scope_type, scope_id)
    runs = WorkflowRun.query.filter(
        WorkflowRun.team_id == team_id,
        WorkflowRun.scope_type == scope_type,
        WorkflowRun.scope_id == scope_id,
    )
    if not team_id:
        runs = runs.filter(WorkflowRun.owner_id == user.id)
    if workflow_key:
        runs = runs.filter(WorkflowRun.workflow_key == workflow_key)
    definitions = workflow_definitions()
    return [
        _run_to_dict(run, definitions.get(run.workflow_key))
        for run in runs.order_by(WorkflowRun.created_at.desc()).limit(200).all()
    ]


# ── Run ─────────────────────────────────────────────────────────────────────


def enqueue_workflow(run_id: str) -> None:
    if dispatch_workflow_job(run_id=run_id):
        return
    app = current_app._get_current_object()

    def run():
        with app.app_context():
            run_workflow(run_id)

    threading.Thread(target=run, name=f"workflow-{run_id}", daemon=True).start()


def _plain(text: str) -> str:
    """An earlier step's output as context for a later one: markers removed
    and long text cut."""
    text = CITATION_MARKER_PATTERN.sub("", text or "")
    if len(text) > WORKFLOW_CONTEXT_MAX_CHARS:
        text = text[:WORKFLOW_CONTEXT_MAX_CHARS] + "\n[…cut for length]"
    return text


def render_template(template: str, inputs: Dict[str, str], outputs: Dict[str, str]):
    def value(match: re.Match) -> str:
        source = inputs if match.group(1) == "inputs" else outputs
        return _plain(source.get(match.group(2), ""))

    return TEMPLATE_VARIABLE.sub(value, template or "").strip()


def _write_step(
    llm: Any,
    usage: Usage,
    owner: User,
    run: WorkflowRun,
    step: WorkflowStep,
    outputs: Dict[str, str],
) -> Tuple[str, List[Dict[str, Any]], Optional[str]]:
    passages: List[Dict[str, Any]] = []
    if step.search and run.document_ids:
        query = render_template(step.search, run.inputs, outputs)[:2000]
        passages = _search_run_documents(owner, run, query or step.title)
    if passages:
        sources = SOURCES_WITH_PASSAGES.format(passages=passage_lines(passages))
    elif step.search and run.document_ids:
        sources = SOURCES_NO_PASSAGES
    else:
        sources = ""
    text = ask(
        llm,
        usage,
        WRITE_PROMPT.format(
            title=step.title,
            instructions=render_template(step.instructions, run.inputs, outputs),
            sources=sources,
        ),
    )
    text = labels_to_markers(text.strip(), passages)
    by_id = {passage["id"]: passage for passage in passages}
    return text, [by_id[i] for i in cited_ids_in_order(text) if i in by_id], None


def _search_run_documents(
    owner: User, run: WorkflowRun, query: str
) -> List[Dict[str, Any]]:
    """The best passages for a query. With a few documents each one is
    searched on its own, so every document gets its share of passages."""
    search = partial(
        search_documents,
        owner,
        query,
        team_id=run.team_id,
        scope_type=run.scope_type,
        scope_id=run.scope_id,
    )
    if len(run.document_ids) > WORKFLOW_PER_DOCUMENT_SEARCH_LIMIT:
        return search(document_ids=run.document_ids, limit=WORKFLOW_SEARCH_PASSAGES)
    per_document = max(
        WORKFLOW_MIN_PASSAGES_PER_DOCUMENT,
        -(-WORKFLOW_SEARCH_PASSAGES // len(run.document_ids)),
    )
    return [
        passage
        for document_id in run.document_ids
        for passage in search(document_ids=[document_id], limit=per_document)
    ]


def _markers(citations: List[Dict[str, Any]]) -> str:
    return "".join(f"[^{citation['id']}]" for citation in citations)


def _analysis_digest(analysis: Dict[str, Any]) -> Tuple[str, List[Dict[str, Any]]]:
    """An analysis as Markdown with markers, for the step output."""
    names = {d["id"]: d["filename"] for d in analysis["documents"]}
    citations: Dict[str, Dict[str, Any]] = {}
    lines: List[str] = []

    def keep(found: List[Dict[str, Any]]) -> str:
        for citation in found:
            citations[citation["id"]] = citation
        return _markers(found)

    if analysis["kind"] == STEP_KIND_REVIEW:
        cells = {(r["documentId"], r["questionId"]): r for r in analysis["results"]}
        for document in analysis["documents"]:
            lines.append(f"### {document['filename']}")
            for question in analysis["questions"]:
                cell = cells.get((document["id"], question["id"])) or {}
                answer = cell.get("answer") or cell.get("error") or "No answer"
                markers = keep(cell.get("citations", []))
                lines.append(f"- **{question['label']}**: {answer}{markers}")
            lines.append("")
    elif analysis["kind"] == STEP_KIND_SUMMARY:
        for result in analysis["results"]:
            lines.append(f"### {names.get(result['documentId'], 'Document')}")
            lines.append(result.get("answer") or result.get("error") or "")
            keep(result.get("citations", []))
            lines.append("")
    else:
        for event in analysis.get("events", []):
            people = f" ({', '.join(event['people'])})" if event["people"] else ""
            date = event.get("date") or event.get("sortDate") or "Undated"
            lines.append(
                f"- **{date}**: {event['event']}{people}{keep(event['citations'])}"
            )
        if not lines:
            lines.append("No dated events were found.")
    return "\n".join(lines).strip(), list(citations.values())


def _analysis_step(
    owner: User, run: WorkflowRun, step: WorkflowStep, outputs: Dict[str, str]
) -> Tuple[str, List[Dict[str, Any]], Optional[str]]:
    if not run.document_ids:
        return "No documents were chosen for this step.", [], None
    analysis = create_analysis(
        owner,
        AnalysisCreate(
            kind=step.kind,
            title=f"{run.title}: {step.title}",
            teamId=run.team_id,
            scopeType=run.scope_type,
            scopeId=run.scope_id,
            documentIds=run.document_ids,
            questions=[
                {
                    "label": label,
                    "prompt": render_template(prompt, run.inputs, outputs),
                }
                for label, prompt in step.questions
            ],
            modelId=run.model_id,
            length=step.summary_length,
        ),
        start=False,
    )
    run_analysis(analysis["id"])
    output, citations = _analysis_digest(get_analysis(analysis["id"], owner))
    return output, citations, analysis["id"]


def _run_step(
    llm: Any,
    usage: Usage,
    owner: User,
    run: WorkflowRun,
    step: WorkflowStep,
    outputs: Dict[str, str],
):
    if step.kind == STEP_KIND_WRITE:
        return _write_step(llm, usage, owner, run, step, outputs)
    return _analysis_step(owner, run, step, outputs)


def _build_llm(run: WorkflowRun) -> Any:
    return build_batch_llm(
        run.model_id,
        run.owner_id,
        WORKFLOW_MAX_OUTPUT_TOKENS,
        WORKFLOW_REQUESTS_PER_SECOND,
        temperature=0.2,
    )


def _finish(run: WorkflowRun, usage: Usage, status: str, error: Optional[str] = None):
    run.input_tokens += usage.input_tokens
    run.output_tokens += usage.output_tokens
    record_token_usage(run.owner_id, run.team_id, run.model_id, usage)
    run.status = status
    run.error = error
    if status in (WORKFLOW_STATUS_DONE, WORKFLOW_STATUS_FAILED):
        run.completed_at = datetime.utcnow()
    db.session.commit()


def run_workflow(run_id: str) -> None:
    """Runs pending steps in order. Stops after a step marked pause (the run
    then waits for the user), on a failure, or when cancelled."""
    run = db.session.get(WorkflowRun, run_id)
    if run is None or run.status == WORKFLOW_STATUS_CANCELLED:
        return
    definition = workflow_definitions().get(run.workflow_key)
    usage = Usage()
    if definition is None:
        _finish(run, usage, WORKFLOW_STATUS_FAILED, "This workflow no longer exists")
        return
    run.status = WORKFLOW_STATUS_RUNNING
    db.session.commit()
    owner = db.session.get(User, run.owner_id)
    steps = {step.key: step for step in definition.steps}
    try:
        llm = _build_llm(run)
    except Exception as error:
        message = str(error) if isinstance(error, ValueError) else None
        _finish(
            run, usage, WORKFLOW_STATUS_FAILED, message or "The model could not start"
        )
        return

    for row in list(run.steps):
        db.session.refresh(run)
        if run.status == WORKFLOW_STATUS_CANCELLED:
            _finish(run, usage, WORKFLOW_STATUS_CANCELLED)
            return
        if row.status == STEP_STATUS_DONE:
            continue
        step = steps.get(row.step_key)
        if step is None:
            continue
        outputs = {
            r.step_key: r.output or ""
            for r in run.steps
            if r.status == STEP_STATUS_DONE
        }
        row.status = STEP_STATUS_RUNNING
        db.session.commit()
        try:
            output, citations, analysis_id = _run_step(
                llm, usage, owner, run, step, outputs
            )
        except Exception as error:
            logger.warning(
                "Workflow %s step %s failed: %s", run.id, row.step_key, error
            )
            row.status = STEP_STATUS_FAILED
            row.error = (
                str(error)
                if isinstance(error, (ValueError, PermissionError))
                else "The model could not finish this step"
            )
            _finish(run, usage, WORKFLOW_STATUS_FAILED, f"{step.title} failed")
            return
        row.output, row.citations, row.analysis_id = output, citations, analysis_id
        row.status = STEP_STATUS_DONE
        row.completed_at = datetime.utcnow()
        db.session.commit()
        remaining = any(r.status != STEP_STATUS_DONE for r in run.steps)
        if step.pause and remaining:
            _finish(run, usage, WORKFLOW_STATUS_WAITING)
            return
    _finish(run, usage, WORKFLOW_STATUS_DONE)


# ── Export ──────────────────────────────────────────────────────────────────


def export_run(run_id: str, user: User) -> Tuple[bytes, str]:
    payload = get_run(run_id, user)
    run = db.session.get(WorkflowRun, run_id)
    preamble = [
        f"{field['label']}: {field['value']}"
        for field in payload["inputs"]
        if field["value"]
    ]
    content = build_cited_document(
        payload["title"],
        [
            (step["title"], step["output"], step["citations"])
            for step in payload["steps"]
            if step["status"] == STEP_STATUS_DONE and step["output"]
        ],
        preamble,
    )
    _audit(user, AUDIT_WORKFLOW_EXPORTED, run, format="docx")
    db.session.commit()
    safe_title = re.sub(r"[^A-Za-z0-9 _-]+", "", payload["title"]).strip() or "workflow"
    return content, f"{safe_title}.docx"
