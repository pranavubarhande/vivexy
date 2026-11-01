import hashlib
import logging
import os
import shutil
import tempfile
import threading
import uuid
import zipfile
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

from flask import current_app
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from agents_core.business_logic.audit import record_audit_log
from agents_core.constants.audit_actions import (
    AUDIT_DOCUMENT_DELETED,
    AUDIT_DOCUMENT_REPROCESSED,
    AUDIT_DOCUMENT_UPLOADED,
    AUDIT_TARGET_DOCUMENT,
)
from agents_core.constants.documents import (
    DOCUMENT_ARCHIVE_EXTENSIONS,
    DOCUMENT_EMBEDDING_MODEL,
    DOCUMENT_MAX_FILE_BYTES,
    DOCUMENT_MAX_FILES_PER_UPLOAD,
    DOCUMENT_MAX_ZIP_ENTRIES,
    DOCUMENT_MAX_ZIP_UNCOMPRESSED_BYTES,
    DOCUMENT_MIME_TYPES,
    DOCUMENT_STAGE_EMBEDDING,
    DOCUMENT_STAGE_OCR,
    DOCUMENT_STAGE_PARSING,
    DOCUMENT_STATUS_FAILED,
    DOCUMENT_STATUS_PROCESSING,
    DOCUMENT_STATUS_QUEUED,
    DOCUMENT_STATUS_READY,
)
from agents_core.extensions import get_document_scope_authorizer
from agents_core.models import (
    Document,
    DocumentChunk,
    DocumentPage,
    TeamMember,
    User,
    db,
)
from agents_core.services.document_chunker import chunk_pages
from agents_core.services.document_parser import DocumentParseError, parse_document
from agents_core.services.document_vector_store import (
    delete_vectors,
    namespace_for,
    upsert_vectors,
)
from agents_core.services.embeddings import embed_passages
from agents_core.services.s3_service import S3Service
from agents_core.worker.dispatcher import dispatch_document_job

logger = logging.getLogger(__name__)


class DocumentAccessError(Exception):
    pass


class DocumentValidationError(Exception):
    pass


class DocumentStorageError(Exception):
    pass


@dataclass
class _StagedFile:
    filename: str
    extension: str
    path: str
    size: int
    sha256: str


def _extension(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _display_name(filename: str) -> str:
    return os.path.basename(filename.replace("\\", "/")).strip() or "untitled"


def _is_team_member(user_id: str, team_id: str) -> bool:
    return (
        TeamMember.query.filter_by(user_id=user_id, team_id=team_id).first() is not None
    )


def authorize_scope(
    user: User,
    team_id: Optional[str],
    scope_type: Optional[str],
    scope_id: Optional[str],
) -> None:
    if team_id and not _is_team_member(user.id, team_id):
        raise DocumentAccessError("You are not a member of this team")
    if bool(scope_type) != bool(scope_id):
        raise DocumentValidationError("scopeType and scopeId must be given together")
    if scope_type:
        authorizer = get_document_scope_authorizer(scope_type)
        if authorizer is None or not authorizer(user, team_id, scope_id):
            raise DocumentAccessError("You do not have access to this scope")


def _get_accessible_document(document_id: str, user: User) -> Document:
    document = db.session.get(Document, document_id)
    if document is None:
        raise LookupError("Document not found")
    if document.team_id is None and document.owner_id != user.id:
        raise LookupError("Document not found")
    try:
        authorize_scope(user, document.team_id, document.scope_type, document.scope_id)
    except DocumentAccessError:
        raise LookupError("Document not found")
    return document


def document_to_dict(document: Document) -> Dict[str, Any]:
    return {
        "id": document.id,
        "teamId": document.team_id,
        "ownerId": document.owner_id,
        "scopeType": document.scope_type,
        "scopeId": document.scope_id,
        "filename": document.filename,
        "mimeType": document.mime_type,
        "size": document.size,
        "status": document.status,
        "stage": document.stage,
        "error": document.error,
        "paginated": document.paginated,
        "pageCount": document.page_count,
        "ocrPageCount": document.ocr_page_count,
        "chunkCount": document.chunk_count,
        "processedAt": (
            document.processed_at.isoformat() if document.processed_at else None
        ),
        "createdAt": document.created_at.isoformat() if document.created_at else None,
        "updatedAt": document.updated_at.isoformat() if document.updated_at else None,
    }


# ── Upload ──────────────────────────────────────────────────────────────────


def _stage_stream(stream, filename: str, workdir: str) -> _StagedFile:
    path = os.path.join(workdir, uuid.uuid4().hex)
    digest = hashlib.sha256()
    size = 0
    with open(path, "wb") as handle:
        while True:
            block = stream.read(1024 * 1024)
            if not block:
                break
            size += len(block)
            if size > DOCUMENT_MAX_FILE_BYTES:
                raise DocumentValidationError(
                    f"{filename} is larger than the "
                    f"{DOCUMENT_MAX_FILE_BYTES // (1024 * 1024)} MB limit"
                )
            digest.update(block)
            handle.write(block)
    if size == 0:
        raise DocumentValidationError(f"{filename} is empty")
    return _StagedFile(
        filename=filename,
        extension=_extension(filename),
        path=path,
        size=size,
        sha256=digest.hexdigest(),
    )


def _expand_zip(archive: _StagedFile, workdir: str) -> List[_StagedFile]:
    try:
        zip_file = zipfile.ZipFile(archive.path)
    except zipfile.BadZipFile:
        raise DocumentValidationError(f"{archive.filename} is not a valid zip file")
    with zip_file:
        members = [
            info
            for info in zip_file.infolist()
            if not info.is_dir()
            and not info.filename.startswith("__MACOSX/")
            and not _display_name(info.filename).startswith(".")
        ]
        if len(members) > DOCUMENT_MAX_ZIP_ENTRIES:
            raise DocumentValidationError(
                f"{archive.filename} has more than {DOCUMENT_MAX_ZIP_ENTRIES} files"
            )
        if (
            sum(info.file_size for info in members)
            > DOCUMENT_MAX_ZIP_UNCOMPRESSED_BYTES
        ):
            raise DocumentValidationError(f"{archive.filename} is too large to unpack")
        staged = []
        for info in members:
            name = _display_name(info.filename)
            if _extension(name) not in DOCUMENT_MIME_TYPES:
                continue
            with zip_file.open(info) as member_stream:
                staged.append(_stage_stream(member_stream, name, workdir))
        return staged


def _stage_uploads(files: List[FileStorage], workdir: str) -> List[_StagedFile]:
    staged: List[_StagedFile] = []
    for upload in files:
        name = _display_name(upload.filename or "")
        extension = _extension(name)
        if (
            extension not in DOCUMENT_MIME_TYPES
            and extension not in DOCUMENT_ARCHIVE_EXTENSIONS
        ):
            supported = ", ".join(
                f".{ext}"
                for ext in sorted({*DOCUMENT_MIME_TYPES, *DOCUMENT_ARCHIVE_EXTENSIONS})
            )
            raise DocumentValidationError(
                f"{name}: unsupported file type. Supported: {supported}"
            )
        staged_file = _stage_stream(upload.stream, name, workdir)
        if extension in DOCUMENT_ARCHIVE_EXTENSIONS:
            staged.extend(_expand_zip(staged_file, workdir))
        else:
            staged.append(staged_file)
        if len(staged) > DOCUMENT_MAX_FILES_PER_UPLOAD:
            raise DocumentValidationError(
                f"An upload can contain at most {DOCUMENT_MAX_FILES_PER_UPLOAD} files"
            )
    if not staged:
        raise DocumentValidationError("No supported files to upload")
    return staged


def _s3_key(document: Document) -> str:
    owner = (
        f"teams/{document.team_id}"
        if document.team_id
        else f"users/{document.owner_id}"
    )
    safe_name = secure_filename(document.filename) or "file"
    return f"documents/{owner}/{document.id}/{safe_name}"


def upload_documents(
    user: User,
    files: List[FileStorage],
    team_id: Optional[str] = None,
    scope_type: Optional[str] = None,
    scope_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    authorize_scope(user, team_id, scope_type, scope_id)
    if not files:
        raise DocumentValidationError("No files were uploaded")

    s3 = S3Service()
    workdir = tempfile.mkdtemp(prefix="vivexy-upload-")
    stored_keys: List[str] = []
    try:
        staged_files = _stage_uploads(files, workdir)
        documents = []
        for staged in staged_files:
            document = Document(
                id=str(uuid.uuid4()),
                team_id=team_id,
                owner_id=user.id,
                scope_type=scope_type,
                scope_id=scope_id,
                filename=staged.filename,
                mime_type=DOCUMENT_MIME_TYPES[staged.extension],
                size=staged.size,
                sha256=staged.sha256,
                status=DOCUMENT_STATUS_QUEUED,
                paginated=staged.extension == "pdf",
            )
            document.s3_key = _s3_key(document)
            with open(staged.path, "rb") as handle:
                if not s3.upload_object(handle, document.s3_key, document.mime_type):
                    raise DocumentStorageError(
                        f"Could not store {staged.filename}. Try again."
                    )
            stored_keys.append(document.s3_key)
            db.session.add(document)
            record_audit_log(
                user,
                AUDIT_DOCUMENT_UPLOADED,
                AUDIT_TARGET_DOCUMENT,
                target_id=document.id,
                team_id=team_id,
                details={
                    "filename": document.filename,
                    "size": document.size,
                    "scopeType": scope_type,
                    "scopeId": scope_id,
                },
                commit=False,
            )
            documents.append(document)
        db.session.commit()
    except Exception:
        db.session.rollback()
        for s3_key in stored_keys:
            s3.delete_file(s3_key)
        raise
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    for document in documents:
        enqueue_document(document.id)
    return [document_to_dict(document) for document in documents]


def enqueue_document(document_id: str) -> None:
    if dispatch_document_job(document_id=document_id):
        return
    app = current_app._get_current_object()

    def run():
        with app.app_context():
            process_document(document_id)

    threading.Thread(target=run, name=f"document-{document_id}", daemon=True).start()


# ── Ingestion ───────────────────────────────────────────────────────────────


def _set_stage(document: Document, stage: str) -> None:
    document.stage = stage
    db.session.commit()


def process_document(document_id: str) -> None:
    document = db.session.get(Document, document_id)
    if document is None:
        logger.warning("Document %s no longer exists, skipping", document_id)
        return

    document.status = DOCUMENT_STATUS_PROCESSING
    document.stage = DOCUMENT_STAGE_PARSING
    document.error = None
    db.session.commit()

    local_path = None
    try:
        local_path = S3Service().download_file(document.s3_key)
        if not local_path:
            raise RuntimeError("Could not download the file from storage")

        parsed = parse_document(
            local_path,
            _extension(document.filename),
            on_ocr_start=lambda: _set_stage(document, DOCUMENT_STAGE_OCR),
        )
        if not any(page.text.strip() for page in parsed.pages):
            raise DocumentParseError("No text could be extracted from this file")

        old_vector_ids = [chunk.id for chunk in document.chunks]
        if old_vector_ids and document.vector_namespace:
            delete_vectors(document.vector_namespace, old_vector_ids)
        DocumentChunk.query.filter_by(document_id=document.id).delete()
        DocumentPage.query.filter_by(document_id=document.id).delete()

        for page in parsed.pages:
            db.session.add(
                DocumentPage(
                    document_id=document.id,
                    page_number=page.page_number,
                    text=page.text,
                    ocr=page.ocr,
                )
            )
        text_chunks = chunk_pages(parsed.pages)
        chunk_rows = [
            DocumentChunk(
                id=str(uuid.uuid4()),
                document_id=document.id,
                chunk_index=index,
                page_number=chunk.page_number,
                char_start=chunk.char_start,
                char_end=chunk.char_end,
                text=chunk.text,
            )
            for index, chunk in enumerate(text_chunks)
        ]
        db.session.add_all(chunk_rows)
        document.stage = DOCUMENT_STAGE_EMBEDDING
        db.session.commit()

        namespace = namespace_for(document.team_id, document.owner_id)
        vectors = embed_passages([row.text for row in chunk_rows])
        metadata_base = {"document_id": document.id}
        if document.scope_type:
            metadata_base["scope_type"] = document.scope_type
            metadata_base["scope_id"] = document.scope_id
        upsert_vectors(
            namespace,
            [
                {
                    "id": row.id,
                    "values": vector,
                    "metadata": {
                        **metadata_base,
                        "page_number": row.page_number,
                        "chunk_index": row.chunk_index,
                    },
                }
                for row, vector in zip(chunk_rows, vectors)
            ],
        )

        document.status = DOCUMENT_STATUS_READY
        document.stage = None
        document.paginated = parsed.paginated
        document.page_count = len(parsed.pages)
        document.ocr_page_count = parsed.ocr_page_count
        document.chunk_count = len(chunk_rows)
        document.embedding_model = DOCUMENT_EMBEDDING_MODEL
        document.vector_namespace = namespace
        document.processed_at = datetime.utcnow()
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        logger.exception("Failed to process document %s", document_id)
        document = db.session.get(Document, document_id)
        if document is not None:
            document.status = DOCUMENT_STATUS_FAILED
            document.error = (
                str(e)
                if isinstance(e, DocumentParseError)
                else "Processing failed. Try again."
            )
            db.session.commit()
    finally:
        if local_path:
            try:
                os.unlink(local_path)
            except OSError:
                pass


# ── Read, delete, reprocess ─────────────────────────────────────────────────


def list_documents(
    user: User,
    team_id: Optional[str] = None,
    scope_type: Optional[str] = None,
    scope_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
) -> Dict[str, Any]:
    authorize_scope(user, team_id, scope_type, scope_id)
    query = Document.query.filter_by(team_id=team_id)
    if not team_id:
        query = query.filter_by(owner_id=user.id)
    query = query.filter_by(scope_type=scope_type, scope_id=scope_id)
    if status:
        query = query.filter_by(status=status)
    page = max(page, 1)
    page_size = min(max(page_size, 1), 200)
    total = query.count()
    documents = (
        query.order_by(Document.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "documents": [document_to_dict(document) for document in documents],
        "total": total,
        "page": page,
        "pageSize": page_size,
    }


def get_document(document_id: str, user: User) -> Dict[str, Any]:
    return document_to_dict(_get_accessible_document(document_id, user))


def get_document_page(document_id: str, page_number: int, user: User) -> Dict[str, Any]:
    document = _get_accessible_document(document_id, user)
    page = DocumentPage.query.filter_by(
        document_id=document.id, page_number=page_number
    ).first()
    if page is None:
        raise LookupError("Page not found")
    return {
        "documentId": document.id,
        "pageNumber": page.page_number,
        "pageCount": document.page_count,
        "text": page.text,
        "ocr": page.ocr,
    }


def get_document_file_url(document_id: str, user: User) -> str:
    document = _get_accessible_document(document_id, user)
    url = S3Service().get_presigned_url(document.s3_key, expiration=900)
    if not url:
        raise DocumentStorageError("Could not create a download link")
    return url


def delete_document(document_id: str, user: User) -> None:
    document = _get_accessible_document(document_id, user)
    vector_ids = [chunk.id for chunk in document.chunks]
    if vector_ids and document.vector_namespace:
        try:
            delete_vectors(document.vector_namespace, vector_ids)
        except Exception:
            logger.exception("Could not delete vectors for document %s", document.id)
    S3Service().delete_file(document.s3_key)
    record_audit_log(
        user,
        AUDIT_DOCUMENT_DELETED,
        AUDIT_TARGET_DOCUMENT,
        target_id=document.id,
        team_id=document.team_id,
        details={"filename": document.filename},
        commit=False,
    )
    db.session.delete(document)
    db.session.commit()


def reprocess_document(document_id: str, user: User) -> Dict[str, Any]:
    document = _get_accessible_document(document_id, user)
    if document.status in (DOCUMENT_STATUS_QUEUED, DOCUMENT_STATUS_PROCESSING):
        raise DocumentValidationError("This document is already being processed")
    document.status = DOCUMENT_STATUS_QUEUED
    document.stage = None
    document.error = None
    record_audit_log(
        user,
        AUDIT_DOCUMENT_REPROCESSED,
        AUDIT_TARGET_DOCUMENT,
        target_id=document.id,
        team_id=document.team_id,
        details={"filename": document.filename},
        commit=False,
    )
    db.session.commit()
    enqueue_document(document.id)
    return document_to_dict(document)
