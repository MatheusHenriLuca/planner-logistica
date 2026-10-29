import pytest
from jose import JWTError, jwt

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


@pytest.fixture(autouse=True)
def _settings_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@localhost/db")
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_hash_password_does_not_return_plaintext():
    hashed = hash_password("s3cret")
    assert hashed != "s3cret"


def test_verify_password_accepts_correct_and_rejects_wrong():
    hashed = hash_password("s3cret")
    assert verify_password("s3cret", hashed) is True
    assert verify_password("wrong", hashed) is False


def test_create_access_token_embeds_subject_and_role():
    token = create_access_token(subject="joana", role="admin")
    payload = jwt.get_unverified_claims(token)
    assert payload["sub"] == "joana"
    assert payload["role"] == "admin"
    assert "exp" in payload


def test_decode_access_token_roundtrips():
    token = create_access_token(subject="joana", role="admin")
    payload = decode_access_token(token)
    assert payload["sub"] == "joana"
    assert payload["role"] == "admin"


def test_decode_access_token_rejects_garbage():
    with pytest.raises(JWTError):
        decode_access_token("not-a-real-token")


def test_decode_access_token_rejects_expired_token():
    token = create_access_token(subject="joana", role="admin", expires_minutes=-1)
    with pytest.raises(JWTError):
        decode_access_token(token)


def test_decode_access_token_rejects_tampered_signature():
    token = create_access_token(subject="joana", role="admin")
    head, _, signature = token.rpartition(".")
    tampered_char = "a" if signature[0] != "a" else "b"
    tampered_token = f"{head}.{tampered_char}{signature[1:]}"
    with pytest.raises(JWTError):
        decode_access_token(tampered_token)
