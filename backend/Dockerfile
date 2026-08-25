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

# Start command
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
