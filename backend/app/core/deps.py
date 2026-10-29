from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import Role, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),  # noqa: B008
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciais invalidas.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
    except JWTError as exc:
        raise credentials_error from exc

    username = payload.get("sub")
    if username is None:
        raise credentials_error

    try:
        user = db.query(User).filter(User.username == username).one_or_none()
    except SQLAlchemyError as exc:
        raise credentials_error from exc
    if user is None:
        raise credentials_error
    return user


def require_role(*allowed_roles: Role | str):
    allowed_values = {role.value if hasattr(role, "value") else str(role) for role in allowed_roles}
    if Role.USUARIO_COMUM.value in allowed_values or "usuario_comum" in allowed_values:
        allowed_values.update({"operador_solda", "operador_estamparia"})

    def _dependency(current_user: User = Depends(get_current_user)) -> User:  # noqa: B008
        is_operator_match = (
            ("usuario_comum" in allowed_values or Role.USUARIO_COMUM.value in allowed_values)
            and current_user.role.startswith("operador")
        )
        if current_user.role not in allowed_values and not is_operator_match:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Voce nao tem permissao para esta acao.",
            )
        return current_user

    return _dependency


def require_permission(permissao: str):
    def _dependency(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),  # noqa: B008
    ) -> User:
        if current_user.role == "admin":
            return current_user
        from app.models.perfil import Cargo
        cargo = db.query(Cargo).filter(Cargo.nome == current_user.role).first()
        if not cargo or not getattr(cargo, permissao, False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Seu cargo não possui a permissão necessária ({permissao}).",
            )
        return current_user

    return _dependency

