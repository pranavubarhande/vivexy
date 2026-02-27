import uuid
from datetime import datetime
from app.models.base import db


class Stock(db.Model):
    __tablename__ = 'stocks'

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    symbol = db.Column(db.String, unique=True, nullable=False)
    name = db.Column(db.String, nullable=False)
    cmp = db.Column(db.String)
    pe = db.Column(db.String)
    market_cap = db.Column(db.String)
    div_yld_pct = db.Column(db.String)
    np_qtr_cr = db.Column(db.String)
    qtr_profit_var_pct = db.Column(db.String)
    sales_qtr_cr = db.Column(db.String)
    qtr_sales_var_pct = db.Column(db.String)
    roce_pct = db.Column(db.String)
    link = db.Column(db.String)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    job_stocks = db.relationship('JobStock', backref='stock', lazy=True)
    data_blobs = db.relationship('StockDataBlob', backref='stock', lazy=True)
    news = db.relationship('StockNews', backref='stock', lazy=True)


class StockDataBlob(db.Model):
    __tablename__ = 'stock_data_blobs'

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    stock_id = db.Column(db.String, db.ForeignKey('stocks.id'), nullable=False)
    blob_type = db.Column(db.String, nullable=False)
    content = db.Column(db.Text, nullable=False)
    as_of_label = db.Column(db.String)
    parsed_json = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class StockNews(db.Model):
    __tablename__ = 'stock_news'

    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    stock_id = db.Column(db.String, db.ForeignKey('stocks.id'), nullable=False)
    title = db.Column(db.String, nullable=False)
    link = db.Column(db.String, nullable=False)
    published_at = db.Column(db.DateTime)
    source = db.Column(db.String)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
