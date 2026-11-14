import re
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from agents_core.constants.prompts import (
    PROMPT_BODY_MAX_CHARS,
    PROMPT_FIELD_CHOICE,
    PROMPT_FIELD_KEY_PATTERN,
    PROMPT_FIELD_TEXT,
    PROMPT_FIELD_TYPES,
    PROMPT_FIELD_VALUE_MAX_CHARS,
    PROMPT_MAX_FIELDS,
    PROMPT_TITLE_MAX_CHARS,
    PROMPT_VISIBILITIES,
    PROMPT_VISIBILITY_PERSONAL,
)

PLACEHOLDER = re.compile(r"\{\{\s*([a-z][a-z0-9_]*)\s*\}\}")


class PromptFieldInput(BaseModel):
    key: str = Field(pattern=PROMPT_FIELD_KEY_PATTERN)
    label: str = Field(min_length=1, max_length=120)
    type: str = Field(default=PROMPT_FIELD_TEXT)
    required: bool = True
    options: List[str] = Field(default_factory=list, max_length=20)
    placeholder: str = Field(default="", max_length=200)

    @field_validator("type")
    @classmethod
    def known_type(cls, value: str) -> str:
        if value not in PROMPT_FIELD_TYPES:
            raise ValueError(f"type must be one of {', '.join(PROMPT_FIELD_TYPES)}")
        return value

    @model_validator(mode="after")
    def choices_have_options(self):
        self.options = [option.strip() for option in self.options if option.strip()]
        if self.type == PROMPT_FIELD_CHOICE and not self.options:
            raise ValueError(f"Give the choices for {self.label}")
        return self


class PromptInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(min_length=1, max_length=PROMPT_TITLE_MAX_CHARS)
    description: Optional[str] = Field(default=None, max_length=1000)
    category: Optional[str] = Field(default=None, max_length=64)
    body: str = Field(min_length=1, max_length=PROMPT_BODY_MAX_CHARS)
    fields: List[PromptFieldInput] = Field(
        default_factory=list, max_length=PROMPT_MAX_FIELDS
    )
    visibility: str = Field(default=PROMPT_VISIBILITY_PERSONAL)
    team_id: Optional[str] = Field(default=None, alias="teamId")

    @field_validator("title", "body")
    @classmethod
    def not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value.strip()

    @field_validator("visibility")
    @classmethod
    def known_visibility(cls, value: str) -> str:
        if value not in PROMPT_VISIBILITIES:
            raise ValueError("visibility must be personal or team")
        return value

    @model_validator(mode="after")
    def fields_match_body(self):
        keys = [field.key for field in self.fields]
        if len(set(keys)) != len(keys):
            raise ValueError("Each field needs its own key")
        used = set(PLACEHOLDER.findall(self.body))
        missing = sorted(used - set(keys))
        if missing:
            raise ValueError(f"Add a field for {{{{{missing[0]}}}}}")
        unused = [key for key in keys if key not in used]
        if unused:
            raise ValueError(f"The prompt never uses {{{{{unused[0]}}}}}")
        return self


class PromptListQuery(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    team_id: Optional[str] = Field(default=None, alias="teamId")
    category: Optional[str] = Field(default=None, max_length=64)
    search: Optional[str] = Field(default=None, max_length=200)


class PromptRenderInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    values: Dict[str, str] = Field(default_factory=dict)
    team_id: Optional[str] = Field(default=None, alias="teamId")

    @field_validator("values")
    @classmethod
    def short_values(cls, values: Dict[str, str]) -> Dict[str, str]:
        for value in values.values():
            if len(value) > PROMPT_FIELD_VALUE_MAX_CHARS:
                raise ValueError("A field value is too long")
        return values
