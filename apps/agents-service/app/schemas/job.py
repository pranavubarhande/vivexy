from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class JobBase(BaseModel):
    name: str
    analysis_prompt: Optional[str] = None
    run_at_time: str = "01:00"
    is_active: bool = True


class JobCreate(JobBase):
    selected_stocks: List[str]


class JobResponse(JobBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
