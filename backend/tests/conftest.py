import os

# app.main now reads get_settings() at import time (to configure CORS), and
# pytest imports every test module during collection - before any test's own
# monkeypatch fixture runs. Without a real DATABASE_URL/JWT_SECRET_KEY set
# this early, the very first `from app.main import app` anywhere in the
# suite would raise a pydantic ValidationError. setdefault so a real
# CI-provided value always wins over this fallback.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
