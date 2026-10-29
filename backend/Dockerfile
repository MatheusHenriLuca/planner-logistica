FROM python:3.12-slim

# Evita geração de .pyc e força stdout/stderr sem buffer
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

WORKDIR /app

# Instala curl para healthcheck e tzdata para fuso horário de Brasília
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=America/Sao_Paulo


# Copia arquivos de dependência e instala
COPY pyproject.toml .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
    "fastapi" \
    "uvicorn[standard]" \
    "sqlalchemy>=2.0,<3.0" \
    "alembic" \
    "psycopg[binary]" \
    "pydantic-settings" \
    "passlib[bcrypt]" \
    "bcrypt>=4.0,<4.1" \
    "python-jose[cryptography]" \
    "python-multipart" \
    "openpyxl"

# Copia o código-fonte da aplicação
COPY . .

# Expõe porta 8000
EXPOSE 8000

# Script de entrada para aplicar migrações e subir a aplicação
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
