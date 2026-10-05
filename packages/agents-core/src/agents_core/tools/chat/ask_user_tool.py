"""
Ask User Tool — pauses agent execution and shows an interactive form in the chat UI.

Uses langgraph interrupt() with type "client_tool_request" + tool_name "form_question"
so the existing client-tool infrastructure (store, streaming handler, /tool-result route)
handles the pause-and-resume with no extra backend plumbing.
"""

import json
import uuid
from typing import List, Literal, Optional

from langchain_core.tools import StructuredTool
from langgraph.types import interrupt
from pydantic import BaseModel, Field


class QuestionField(BaseModel):
    id: str = Field(
        ..., description="Unique key used to key the answer in the response dict."
    )
    label: str = Field(..., description="Question text shown to the user.")
    type: Literal[
        "text",
        "textarea",
        "number",
        "select",
        "multiselect",
        "date",
        "boolean",
        "rating",
    ] = Field("text", description="Input type.")
    description: Optional[str] = Field(
        None, description="Helper text shown below the label."
    )
    required: bool = Field(
        True, description="Whether the user must answer this question."
    )
    options: Optional[List[str]] = Field(
        None, description="Choices for select / multiselect types."
    )
    placeholder: Optional[str] = Field(
        None, description="Placeholder text for text/textarea/number inputs."
    )
    default: Optional[str] = Field(None, description="Pre-filled default value.")


class AskUserInput(BaseModel):
    title: str = Field(
        ...,
        description="Short title shown at the top of the form (e.g. 'Tell me about your portfolio').",
    )
    description: Optional[str] = Field(
        None, description="Longer description or instructions shown below the title."
    )
    questions: List[QuestionField] = Field(
        ...,
        description="List of questions to ask. Each question produces one key in the answer dict.",
        min_length=1,
        max_length=15,
    )


def _ask_user_func(
    title: str, description: Optional[str], questions: List[dict]
) -> str:
    """
    Pauses execution and sends an interactive form to the chat UI.
    Resumes once the user submits answers; returns a JSON object keyed by question id.
    """
    # Serialize Pydantic QuestionField objects → plain dicts so json.dumps
    # in the SSE layer doesn't choke on non-serializable objects.
    serialized_questions = [
        (
            q.model_dump()
            if hasattr(q, "model_dump")
            else (q if isinstance(q, dict) else vars(q))
        )
        for q in questions
    ]
    result = interrupt(
        {
            "type": "client_tool_request",
            "request_id": str(uuid.uuid4()),
            "tool_name": "form_question",
            "tool_input": {
                "title": title,
                "description": description,
                "questions": serialized_questions,
            },
        }
    )
    if result is None:
        return json.dumps({"error": "User did not submit the form (timed out)."})
    return result if isinstance(result, str) else json.dumps(result)


def get_ask_user_tool() -> StructuredTool:
    async def _async(**kwargs):
        return _ask_user_func(**kwargs)

    return StructuredTool.from_function(
        func=lambda **kwargs: _ask_user_func(**kwargs),
        coroutine=_async,
        name="ask_user",
        description=(
            "Pause and ask the user a set of structured questions via an interactive form in the chat. "
            "Use this when you need specific information before proceeding — e.g. risk tolerance, "
            "investment goals, preferences, confirmation of choices. "
            "Returns a JSON object with each question id mapped to the user's answer. "
            "Supported question types: text, textarea, number, select, multiselect, date, boolean, rating."
        ),
        args_schema=AskUserInput,
    )
