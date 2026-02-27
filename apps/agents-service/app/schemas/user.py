from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.enums import Role

class UserBase(BaseModel):
    email: str
    name: Optional[str] = None
    role: Role = Role.USER
    avatar: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
        validate_by_name = True

    def dict(self, **kwargs):
        data = super().dict(**kwargs)
        return {
            'id': data['id'],
            'email': data['email'],
            'name': data.get('name'),
            'role': data['role'].value if hasattr(data['role'], 'value') else data['role'],
            'avatar': data.get('avatar'),
            'createdAt': data['created_at'].isoformat() if data.get('created_at') else None,
            'updatedAt': data['updated_at'].isoformat() if data.get('updated_at') else None
        }

class UserLogin(BaseModel):
    email: str
    password: str
