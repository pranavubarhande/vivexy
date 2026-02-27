from typing import Dict, Any
from datetime import datetime
from app.models import db, User
from app.utils.auth import hash_password, verify_password

def get_user_profile(user_id: str) -> Dict[str, Any]:
    """Get user profile."""
    user = User.query.filter_by(id=user_id).first()
    if not user:
        raise ValueError('User not found')

    return {
        'id': user.id,
        'email': user.email,
        'name': user.name,
        'role': user.role.value,
        'avatar': user.avatar,
        'createdAt': user.created_at.isoformat(),
        'updatedAt': user.updated_at.isoformat(),
    }

def update_user_profile(user_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Update user profile."""
    user = User.query.filter_by(id=user_id).first()
    if not user:
        raise ValueError('User not found')

    # Check if email is already taken
    if data.get('email') and data['email'] != user.email:
        existing_user = User.query.filter_by(email=data['email']).first()
        if existing_user:
            raise ValueError('Email is already taken')

    # Update fields
    if 'name' in data:
        user.name = data['name']
    if 'email' in data:
        user.email = data['email']

    user.updated_at = datetime.utcnow()
    db.session.commit()

    return {
        'id': user.id,
        'email': user.email,
        'name': user.name,
        'role': user.role.value,
        'avatar': user.avatar,
        'createdAt': user.created_at.isoformat(),
        'updatedAt': user.updated_at.isoformat(),
    }

def update_user_password(user_id: str, current_password: str, new_password: str) -> Dict[str, Any]:
    """Update user password."""
    user = User.query.filter_by(id=user_id).first()
    if not user:
        raise ValueError('User not found')

    # Verify current password
    if not verify_password(current_password, user.password):
        raise ValueError('Current password is incorrect')

    # Hash new password and update
    user.password = hash_password(new_password)
    user.updated_at = datetime.utcnow()
    db.session.commit()

    return {'message': 'Password updated successfully'}

def delete_user(user_id: str) -> Dict[str, Any]:
    """Delete user account."""
    user = User.query.filter_by(id=user_id).first()
    if not user:
        raise ValueError('User not found')

    db.session.delete(user)
    db.session.commit()

    return {'message': 'Account deleted successfully'}