FROM python:3.10-slim

WORKDIR /app

# Copy requirements and install
# No system packages needed: PyMySQL is pure Python,
# and all other packages have pre-built wheels on PyPI.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend files
COPY . .

# Expose FastAPI port
EXPOSE 8000

# Start command - gunakan gunicorn + uvicorn workers untuk multi-core
# UVICORN_WORKERS dari docker-compose env (default 4 untuk 2 core CPU)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS:-4} --loop uvloop --http httptools"]
