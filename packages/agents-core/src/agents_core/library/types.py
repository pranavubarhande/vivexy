from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Tuple

from agents_core.constants.prompts import PROMPT_FIELD_TEXT
from agents_core.constants.workflows import DOCUMENTS_REQUIRED, STEP_KIND_WRITE


@dataclass(frozen=True)
class PromptField:
    """A fill-in field. The prompt body refers to it as {{key}}."""

    key: str
    label: str
    type: str = PROMPT_FIELD_TEXT
    required: bool = True
    options: Tuple[str, ...] = ()
    placeholder: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "type": self.type,
            "required": self.required,
            "options": list(self.options),
            "placeholder": self.placeholder,
        }


@dataclass(frozen=True)
class PromptTemplate:
    key: str
    title: str
    body: str
    category: str
    description: str = ""
    fields: Tuple[PromptField, ...] = ()


@dataclass(frozen=True)
class WorkflowStep:
    """One step of a workflow.

    kind "write" asks the model to write from `instructions`. If `search` is
    set, it is a query for the run's documents and the best passages are
    given to the model, which must cite them. kinds "review", "summary" and
    "timeline" run a document analysis over the run's documents; "review"
    asks `questions` as (label, prompt) pairs.

    `instructions`, `search` and question prompts may use {{inputs.<key>}}
    and {{steps.<key>}} (an earlier step's output). With `pause` the run
    stops after this step so the user can check or edit it before going on.
    """

    key: str
    title: str
    kind: str = STEP_KIND_WRITE
    instructions: str = ""
    search: Optional[str] = None
    questions: Tuple[Tuple[str, str], ...] = ()
    summary_length: str = "detailed"
    pause: bool = False
    description: str = ""


@dataclass(frozen=True)
class WorkflowDefinition:
    key: str
    name: str
    description: str
    category: str
    steps: Tuple[WorkflowStep, ...]
    inputs: Tuple[PromptField, ...] = ()
    documents: str = DOCUMENTS_REQUIRED
    documents_hint: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
