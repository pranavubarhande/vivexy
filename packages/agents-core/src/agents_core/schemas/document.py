from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from agents_core.constants.documents import (
    DOCUMENT_STATUS_FAILED,
    DOCUMENT_STATUS_PROCESSING,
    DOCUMENT_STATUS_QUEUED,
    DOCUMENT_STATUS_READY,
)

DOCUMENT_STATUS_PATTERN = (
    f"^({DOCUMENT_STATUS_QUEUED}|{DOCUMENT_STATUS_PROCESSING}|"
    f"{DOCUMENT_STATUS_READY}|{DOCUMENT_STATUS_FAILED})$"
)


class DocumentScope(BaseModel):
    team_id: Optional[str] = Field(default=None, alias="teamId")
    scope_type: Optional[str] = Field(default=None, alias="scopeType", max_length=64)
    scope_id: Optional[str] = Field(default=None, alias="scopeId", max_length=128)


class DocumentListQuery(DocumentScope):
    status: Optional[str] = Field(default=None, pattern=DOCUMENT_STATUS_PATTERN)
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=200, alias="pageSize")


class DocumentSearchRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    query: str = Field(min_length=1, max_length=2000)
    team_id: Optional[str] = Field(default=None, alias="teamId")
    scope_type: Optional[str] = Field(default=None, alias="scopeType", max_length=64)
    scope_id: Optional[str] = Field(default=None, alias="scopeId", max_length=128)
    document_ids: Optional[List[str]] = Field(default=None, alias="documentIds")
    limit: int = Field(default=8, ge=1, le=25)
