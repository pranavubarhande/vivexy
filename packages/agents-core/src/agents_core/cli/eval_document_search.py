"""Measure document search quality against a set of known answers.

python -m agents_core.cli.eval_document_search <cases.jsonl> --user <email>
    [--team-id ID] [--scope-type matter --scope-id ID] [--k 5]

Each line of cases.jsonl is {"query": "...", "filename": "msa.pdf", "page": 4};
"page" is optional. A case is a hit when a result from that file (and page) is
in the top k. Prints each miss and the overall hit rate and mean reciprocal rank.
"""

import argparse
import json
import sys
from typing import Any, Dict, List, Optional

from agents_core.app_factory import create_app
from agents_core.business_logic.document_search import search_documents
from agents_core.flask_config import BaseConfig
from agents_core.models import User


def _rank(results: List[Dict[str, Any]], case: Dict[str, Any]) -> Optional[int]:
    for position, result in enumerate(results, start=1):
        if result["filename"] != case["filename"]:
            continue
        if case.get("page") is None or result["pageNumber"] == case["page"]:
            return position
    return None


def evaluate(
    cases: List[Dict[str, Any]],
    user: User,
    k: int,
    team_id: Optional[str] = None,
    scope_type: Optional[str] = None,
    scope_id: Optional[str] = None,
) -> Dict[str, Any]:
    ranks = []
    for case in cases:
        results = search_documents(
            user,
            case["query"],
            team_id=team_id,
            scope_type=scope_type,
            scope_id=scope_id,
            limit=k,
        )
        rank = _rank(results, case)
        ranks.append(rank)
        if rank is None:
            found = [f"{r['filename']} p{r['pageNumber']}" for r in results[:3]]
            print(
                f"MISS  {case['query']!r}: expected {case['filename']} "
                f"p{case.get('page', '*')}, got {found}"
            )
    hits = [rank for rank in ranks if rank is not None]
    return {
        "cases": len(cases),
        "hitRate": len(hits) / len(cases) if cases else 0.0,
        "meanReciprocalRank": (
            sum(1 / rank for rank in hits) / len(cases) if cases else 0.0
        ),
    }


def main(config_object=BaseConfig) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cases")
    parser.add_argument(
        "--user", required=True, help="Email of a user who can read the documents"
    )
    parser.add_argument("--team-id")
    parser.add_argument("--scope-type")
    parser.add_argument("--scope-id")
    parser.add_argument("--k", type=int, default=5)
    args = parser.parse_args()
    with open(args.cases) as handle:
        cases = [json.loads(line) for line in handle if line.strip()]
    with create_app(config_object).app_context():
        user = User.query.filter(User.email.ilike(args.user.strip())).first()
        if user is None:
            print(f"No user found with email {args.user}")
            return 1
        summary = evaluate(
            cases, user, args.k, args.team_id, args.scope_type, args.scope_id
        )
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
