from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class StockBase(BaseModel):
    symbol: str
    name: str
    cmp: Optional[str] = None
    pe: Optional[str] = None
    market_cap: Optional[str] = None
    div_yld_pct: Optional[str] = None
    np_qtr_cr: Optional[str] = None
    qtr_profit_var_pct: Optional[str] = None
    sales_qtr_cr: Optional[str] = None
    qtr_sales_var_pct: Optional[str] = None
    roce_pct: Optional[str] = None
    link: Optional[str] = None


class StockResponse(StockBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
