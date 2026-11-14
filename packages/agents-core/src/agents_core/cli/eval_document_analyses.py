"""Score a review grid against known answers.

python -m agents_core.cli.eval_document_analyses <expected.jsonl> --user <email>
    (--analysis-id ID | --questions questions.json --model "Gemini 2.5 Flash")
    [--team-id ID] [--scope-type matter --scope-id ID] [--min 0.9]

With --analysis-id it scores a finished review. With --questions it runs a new
review over every document named in expected.jsonl (they must be uploaded and
ready in the given team or scope) and scores that. Make a test set with
agents_core.cli.make_review_test_set.

A cell is correct when it is "not found" where nothing should be found, or it
is found, cites at least one passage, and its answer contains one of the
expected values as whole words. It also reports how many correct cells cite a
passage that itself contains the expected value. Prints each miss and the
accuracy, and exits with 1 when accuracy is below --min.
"""

import argparse
import json
import re
import sys
from typing import Any, Dict, List, Optional

from agents_core.app_factory import create_app
from agents_core.business_logic.document_analyses import (
    create_analysis,
    get_analysis,
    run_analysis,
)
from agents_core.flask_config import BaseConfig
from agents_core.models import Document, LLMModel, User
from agents_core.schemas.document_analysis import AnalysisCreate


def _mentions(answer: str, value: str) -> bool:
    pattern = r"(?<!\w)" + re.escape(value.lower()) + r"(?!\w)"
    return re.search(pattern, answer.lower()) is not None


def score_cell(result: Optional[Dict[str, Any]], case: Dict[str, Any]) -> bool:
    if result is None or result["status"] != "done":
        return False
    if not case["found"]:
        return result["found"] is False
    return (
        bool(result["found"])
        and bool(result["citations"])
        and any(_mentions(result["answer"] or "", v) for v in case["expected"])
    )


def sources_hold_answer(result: Dict[str, Any], case: Dict[str, Any]) -> bool:
    return any(
        _mentions(" ".join(citation["quote"].split()), value)
        for citation in result["citations"]
        for value in case["expected"]
    )


def score(payload: Dict[str, Any], cases: List[Dict[str, Any]]) -> Dict[str, Any]:
    question_ids = {q["label"]: q["id"] for q in payload["questions"]}
    document_ids = {d["filename"]: d["id"] for d in payload["documents"]}
    cells = {(r["documentId"], r["questionId"]): r for r in payload["results"]}
    correct = 0
    grounded = 0
    by_question: Dict[str, List[int]] = {}
    for case in cases:
        result = cells.get(
            (document_ids.get(case["filename"]), question_ids.get(case["question"]))
        )
        ok = score_cell(result, case)
        correct += ok
        if ok and case["found"]:
            grounded += sources_hold_answer(result, case)
            if not sources_hold_answer(result, case):
                print(f"UNGROUNDED  {case['filename']} / {case['question']}")
        tally = by_question.setdefault(case["question"], [0, 0])
        tally[0] += ok
        tally[1] += 1
        if not ok:
            got = (
                "missing"
                if result is None
                else (
                    f"{'found' if result['found'] else 'not found'}: "
                    f"{(result['answer'] or result['error'] or '')[:120]!r}"
                )
            )
            want = case["expected"] if case["found"] else "not found"
            print(
                f"MISS  {case['filename']} / {case['question']}: want {want}, got {got}"
            )
    return {
        "cells": len(cases),
        "correct": correct,
        "accuracy": correct / len(cases) if cases else 0.0,
        "foundCellsWithAnswerInSource": (
            f"{grounded}/{sum(1 for case in cases if case['found'])}"
        ),
        "byQuestion": {q: f"{ok}/{total}" for q, (ok, total) in by_question.items()},
        "inputTokens": payload["inputTokens"],
        "outputTokens": payload["outputTokens"],
    }


def _run_review(
    user: User,
    cases: List[Dict[str, Any]],
    questions_path: str,
    model_name: str,
    team_id: Optional[str],
    scope_type: Optional[str],
    scope_id: Optional[str],
) -> str:
    with open(questions_path) as handle:
        questions = json.load(handle)
    filenames = list(dict.fromkeys(case["filename"] for case in cases))
    documents = Document.query.filter(
        Document.filename.in_(filenames),
        Document.team_id == team_id,
        Document.scope_type == scope_type,
        Document.scope_id == scope_id,
    ).all()
    by_name = {document.filename: document.id for document in documents}
    missing = [name for name in filenames if name not in by_name]
    if missing:
        raise SystemExit(f"Not uploaded here: {', '.join(missing[:5])}")
    model = LLMModel.query.filter_by(name=model_name).first()
    if model is None:
        raise SystemExit(f"No model named {model_name}")
    analysis = create_analysis(
        user,
        AnalysisCreate(
            kind="review",
            title="Review test set",
            teamId=team_id,
            scopeType=scope_type,
            scopeId=scope_id,
            documentIds=[by_name[name] for name in filenames],
            questions=questions,
            modelId=model.id,
        ),
        start=False,
    )
    run_analysis(analysis["id"])
    return analysis["id"]


def main(config_object=BaseConfig) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("expected")
    parser.add_argument("--user", required=True)
    parser.add_argument("--analysis-id")
    parser.add_argument("--questions")
    parser.add_argument("--model", default="Gemini 2.5 Flash")
    parser.add_argument("--team-id")
    parser.add_argument("--scope-type")
    parser.add_argument("--scope-id")
    parser.add_argument("--min", type=float, default=0.9)
    args = parser.parse_args()
    if bool(args.analysis_id) == bool(args.questions):
        parser.error("give either --analysis-id or --questions")
    with open(args.expected) as handle:
        cases = [json.loads(line) for line in handle if line.strip()]
    with create_app(config_object).app_context():
        user = User.query.filter(User.email.ilike(args.user.strip())).first()
        if user is None:
            print(f"No user found with email {args.user}")
            return 1
        analysis_id = args.analysis_id or _run_review(
            user,
            cases,
            args.questions,
            args.model,
            args.team_id,
            args.scope_type,
            args.scope_id,
        )
        summary = {
            "analysisId": analysis_id,
            **score(get_analysis(analysis_id, user), cases),
        }
    print(json.dumps(summary, indent=2))
    return 0 if summary["accuracy"] >= args.min else 1


if __name__ == "__main__":
    sys.exit(main())
