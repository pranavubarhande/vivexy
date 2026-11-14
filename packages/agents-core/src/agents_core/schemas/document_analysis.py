from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from agents_core.constants.analyses import (
    ANALYSIS_KIND_REVIEW,
    ANALYSIS_KIND_SUMMARY,
    ANALYSIS_KIND_TIMELINE,
    ANALYSIS_MAX_QUESTIONS,
    ANALYSIS_QUESTION_MAX_CHARS,
    SUMMARY_LENGTHS,
)

ANALYSIS_KIND_PATTERN = (
    f"^({ANALYSIS_KIND_REVIEW}|{ANALYSIS_KIND_SUMMARY}|{ANALYSIS_KIND_TIMELINE})$"
)


class AnalysisQuestionInput(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    prompt: str = Field(min_length=1, max_length=ANALYSIS_QUESTION_MAX_CHARS)

    @field_validator("label", "prompt")
    @classmethod
    def strip(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class AnalysisScope(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    team_id: Optional[str] = Field(default=None, alias="teamId")
    scope_type: Optional[str] = Field(default=None, alias="scopeType", max_length=64)
    scope_id: Optional[str] = Field(default=None, alias="scopeId", max_length=128)


class AnalysisListQuery(AnalysisScope):
    kind: Optional[str] = Field(default=None, pattern=ANALYSIS_KIND_PATTERN)


class AnalysisCreate(AnalysisScope):
    kind: str = Field(pattern=ANALYSIS_KIND_PATTERN)
    title: Optional[str] = Field(default=None, max_length=255)
    document_ids: List[str] = Field(alias="documentIds", min_length=1)
    questions: List[AnalysisQuestionInput] = Field(
        default_factory=list, max_length=ANALYSIS_MAX_QUESTIONS
    )
    model_id: str = Field(alias="modelId", min_length=1)
    length: str = Field(default="short")

    @field_validator("title")
    @classmethod
    def blank_title(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() or None if value else None

    @field_validator("length")
    @classmethod
    def known_length(cls, value: str) -> str:
        if value not in SUMMARY_LENGTHS:
            raise ValueError(f"length must be one of {', '.join(SUMMARY_LENGTHS)}")
        return value
