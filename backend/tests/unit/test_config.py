from app.core.config import Settings, get_settings


def test_settings_reads_required_fields_from_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@localhost/db")
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret")

    settings = Settings()

    assert settings.database_url == "postgresql+psycopg://user:pass@localhost/db"
    assert settings.jwt_secret_key == "test-secret"
    assert settings.jwt_algorithm == "HS256"
    assert settings.jwt_expire_minutes == 60


def test_get_settings_is_cached(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@localhost/db")
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret")

    assert get_settings() is get_settings()
