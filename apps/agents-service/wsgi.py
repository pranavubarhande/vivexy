"""WSGI entrypoint used by Gunicorn in production.

`app.py` keeps its `app.run(...)` block for local development
(`uv run python app.py`). In containers we run:
    gunicorn --bind 0.0.0.0:5000 wsgi:app
"""

from app import create_app
from configs import Config

app = create_app(Config)
