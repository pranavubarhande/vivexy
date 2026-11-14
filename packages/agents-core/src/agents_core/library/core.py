"""Vivexy's own built-in prompts and workflows: general document work that
fits any team. Products can hide them with include_core_library=False."""

from agents_core.constants.prompts import PROMPT_FIELD_CHOICE, PROMPT_FIELD_LONG_TEXT
from agents_core.constants.workflows import (
    DOCUMENTS_REQUIRED,
    STEP_KIND_SUMMARY,
)
from agents_core.library.types import (
    PromptField,
    PromptTemplate,
    WorkflowDefinition,
    WorkflowStep,
)

CORE_PROMPTS = (
    PromptTemplate(
        key="summarize-for-reader",
        title="Summarize for a reader",
        category="General",
        description="A plain-language summary of the documents for a named " "reader.",
        body="Summarize the documents in this chat for {{reader}}. Keep it to "
        "{{length}}, lead with what they need to decide or do, and cite every "
        "fact.",
        fields=(
            PromptField("reader", "Who is it for?", placeholder="the client's CFO"),
            PromptField(
                "length",
                "Length",
                type=PROMPT_FIELD_CHOICE,
                options=("one paragraph", "half a page", "one page"),
            ),
        ),
    ),
    PromptTemplate(
        key="key-dates",
        title="Key dates and deadlines",
        category="General",
        description="Every date, deadline and notice period, in order.",
        body="List every date, deadline and notice period in the documents, "
        "oldest first, as a table with the date, what happens, who must act "
        "and the source.",
    ),
    PromptTemplate(
        key="risks",
        title="Find the risks",
        category="General",
        description="Risks and unusual terms, ranked.",
        body="Read the documents from the point of view of {{party}} and list "
        "the risks and unusual terms, most serious first. For each, say why it "
        "matters and what to ask for instead. Cite each one.",
        fields=(PromptField("party", "Whose side are you on?"),),
    ),
    PromptTemplate(
        key="reply-email",
        title="Draft a reply",
        category="General",
        description="A reply to a message, grounded in the documents.",
        body="Draft a reply to the message below. Use a {{tone}} tone and rely "
        "only on facts in the documents, citing them.\n\nMessage:\n{{message}}",
        fields=(
            PromptField("message", "Message to reply to", type=PROMPT_FIELD_LONG_TEXT),
            PromptField(
                "tone",
                "Tone",
                type=PROMPT_FIELD_CHOICE,
                options=("friendly", "neutral", "firm"),
            ),
        ),
    ),
)

CORE_WORKFLOWS = (
    WorkflowDefinition(
        key="document-brief",
        name="Document brief",
        category="General",
        description="Summarize documents, agree the key issues, then write a "
        "cited brief for a purpose you describe.",
        documents=DOCUMENTS_REQUIRED,
        documents_hint="The documents the brief is about",
        inputs=(
            PromptField(
                "purpose",
                "What is the brief for?",
                type=PROMPT_FIELD_LONG_TEXT,
                placeholder="Advise the board whether to renew the supplier "
                "contracts",
            ),
        ),
        steps=(
            WorkflowStep(
                key="summaries",
                title="Summarize each document",
                kind=STEP_KIND_SUMMARY,
                summary_length="short",
            ),
            WorkflowStep(
                key="issues",
                title="Key issues",
                instructions="List the key issues in these documents for this "
                "purpose: {{inputs.purpose}}\n\nDocument summaries:\n"
                "{{steps.summaries}}\n\nWrite a numbered list. For each issue, "
                "one line on why it matters, citing the passages.",
                search="{{inputs.purpose}} obligations risks deadlines amounts",
                pause=True,
                description="Check and edit the issues before the brief is " "written.",
            ),
            WorkflowStep(
                key="brief",
                title="Brief",
                instructions="Write a brief for this purpose: {{inputs.purpose}}"
                "\n\nCover these issues, in this order:\n{{steps.issues}}\n\n"
                "Start with a two-sentence answer, then a short section per "
                "issue with a recommendation. Cite the passages for every fact.",
                search="{{inputs.purpose}} {{steps.issues}}",
            ),
        ),
    ),
)
