from typing import Dict

from agents_core.extensions import (
    core_library_included,
    get_extension_prompts,
    get_extension_workflows,
)
from agents_core.library.core import CORE_PROMPTS, CORE_WORKFLOWS
from agents_core.library.types import PromptTemplate, WorkflowDefinition


def built_in_prompts() -> Dict[str, PromptTemplate]:
    """Built-in prompts by key. A product's prompt replaces a core prompt
    with the same key."""
    prompts = list(CORE_PROMPTS) if core_library_included() else []
    return {prompt.key: prompt for prompt in [*prompts, *get_extension_prompts()]}


def workflow_definitions() -> Dict[str, WorkflowDefinition]:
    workflows = list(CORE_WORKFLOWS) if core_library_included() else []
    return {
        workflow.key: workflow for workflow in [*workflows, *get_extension_workflows()]
    }
