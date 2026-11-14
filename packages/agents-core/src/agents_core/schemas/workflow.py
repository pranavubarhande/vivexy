from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from agents_core.constants.prompts import PROMPT_FIELD_VALUE_MAX_CHARS
from agents_core.constants.workflows import WORKFLOW_STEP_OUTPUT_MAX_CHARS


class WorkflowScope(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    team_id: Optional[str] = Field(default=None, alias="teamId")
    scope_type: Optional[str] = Field(default=None, alias="scopeType", max_length=64)
    scope_id: Optional[str] = Field(default=None, alias="scopeId", max_length=128)


class WorkflowRunListQuery(WorkflowScope):
    workflow_key: Optional[str] = Field(
        default=None, alias="workflowKey", max_length=100
    )


class WorkflowStartInput(WorkflowScope):
    workflow_key: str = Field(alias="workflowKey", min_length=1, max_length=100)
    title: Optional[str] = Field(default=None, max_length=255)
    document_ids: List[str] = Field(default_factory=list, alias="documentIds")
    inputs: Dict[str, str] = Field(default_factory=dict)
    model_id: str = Field(alias="modelId", min_length=1)

    @field_validator("inputs")
    @classmethod
    def short_inputs(cls, inputs: Dict[str, str]) -> Dict[str, str]:
        for value in inputs.values():
            if len(value) > PROMPT_FIELD_VALUE_MAX_CHARS:
                raise ValueError("An input is too long")
        return inputs


class WorkflowStepEdit(BaseModel):
    output: str = Field(min_length=1, max_length=WORKFLOW_STEP_OUTPUT_MAX_CHARS)
