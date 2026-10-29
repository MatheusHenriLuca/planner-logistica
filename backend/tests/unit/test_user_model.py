from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.session import Base
from app.models.user import Role, User


def test_role_members():
    assert {r.value for r in Role} == {
        "admin",
        "programador",
        "usuario_comum",
        "operador_solda",
        "operador_estamparia",
    }


def test_user_model_persists_and_reads_back():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[User.__table__])

    with Session(engine) as session:
        session.add(User(username="joana", hashed_password="hashed", role=Role.ADMIN.value))
        session.commit()

        persisted = session.query(User).filter_by(username="joana").one()
        assert persisted.role == Role.ADMIN.value
        assert persisted.hashed_password == "hashed"
