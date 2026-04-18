FROM python:3.11-slim

WORKDIR /app

# Install uv
RUN pip install uv

# Copy pyproject.toml
COPY pyproject.toml ./

# Install dependencies
RUN uv sync --no-dev

# Copy source code
COPY . .

EXPOSE 5000

CMD ["uv", "run", "python", "app.py"]
