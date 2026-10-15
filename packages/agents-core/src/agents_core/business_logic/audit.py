from typing import Any, Dict, Optional

from agents_core.models import AuditLog, User, db
from flask import has_request_context, request


def record_audit_log(
    actor: Optional[User],
    action: str,
    target_type: str,
    target_id: Optional[str] = None,
    team_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    commit: bool = True,
) -> AuditLog:
    """Persist a privileged action. Callers pass commit=False to join an open
    transaction so the change and its audit row land together."""
    audit_log = AuditLog(
        actor_id=actor.id if actor else None,
        actor_email=actor.email if actor else None,
        action=action,
        target_type=target_type,
        target_id=target_id,
        team_id=team_id,
        details=details or {},
        ip_address=request.remote_addr if has_request_context() else None,
    )
    db.session.add(audit_log)
    if commit:
        db.session.commit()
    return audit_log


def list_audit_logs(
    team_id: Optional[str] = None,
    action: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
) -> Dict[str, Any]:
    query = AuditLog.query
    if team_id:
        query = query.filter(AuditLog.team_id == team_id)
    if action:
        query = query.filter(AuditLog.action == action)

    total = query.count()
    rows = (
        query.order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "items": [row.to_dict() for row in rows],
        "total": total,
        "page": page,
        "pageSize": page_size,
    }
