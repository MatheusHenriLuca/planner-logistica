import pytest
from pydantic import ValidationError

from app.models.user import Role
from app.schemas.user import Token, UserCreate, UserOut


def test_user_create_accepts_valid_role():
    payload = UserCreate(username="joana", password="s3cret", role=Role.ADMIN)
    assert payload.role is Role.ADMIN


def test_user_create_rejects_invalid_role():
    with pytest.raises(ValidationError):
        UserCreate(username="joana", password="s3cret", role="not-a-role")


def test_user_out_builds_from_orm_attributes():
    class FakeOrmUser:
        id = 1
        username = "joana"
        role = "admin"

    out = UserOut.model_validate(FakeOrmUser())
    assert out.role is Role.ADMIN


def test_token_defaults_to_bearer_type():
    token = Token(access_token="abc")
    assert token.token_type == "bearer"
