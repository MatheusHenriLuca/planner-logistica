from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.user import Role, User
from app.schemas.user import Token, UserCreate, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])
_optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def _authenticated_admin_or_none(token: str | None, db: Session) -> User | None:
    if token is None:
        return None
    try:
        user = get_current_user(token=token, db=db)
    except HTTPException:
        return None
    return user if user.role == Role.ADMIN.value else None


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(
    payload: UserCreate,
    db: Session = Depends(get_db),  # noqa: B008
    token: str | None = Depends(_optional_oauth2_scheme),
) -> User:
    is_first_user = db.query(User).first() is None

    if is_first_user:
        role = Role.ADMIN
    else:
        if _authenticated_admin_or_none(token, db) is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cadastro de novos usuarios requer um administrador autenticado.",
            )
        role = payload.role

    role_val = role.value if hasattr(role, "value") else str(role)
    user = User(
        username=payload.username,
        hashed_password=hash_password(payload.password),
        role=role_val,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nome de usuario ja existe.",
        ) from exc
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> Token:
    user = db.query(User).filter(User.username == form_data.username).one_or_none()
    if user is None or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario ou senha invalidos.",
        )
    access_token = create_access_token(subject=user.username, role=user.role)
    return Token(access_token=access_token)


@router.get("/me")
def get_me(
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
):
    from app.models.perfil import Cargo

    cargo = db.query(Cargo).filter(Cargo.nome == current_user.role).first()
    permissoes = {
        "pode_programar": cargo.pode_programar if cargo else (current_user.role in ("admin", "programador")),
        "pode_iniciar_producao": cargo.pode_iniciar_producao if cargo else True,
        "pode_reordenar_producao": cargo.pode_reordenar_producao if cargo else (current_user.role in ("admin", "programador")),
        "pode_mover_colunas": cargo.pode_mover_colunas if cargo else (current_user.role in ("admin", "programador")),
        "pode_gerenciar_colunas": cargo.pode_gerenciar_colunas if cargo else (current_user.role in ("admin", "programador")),
        "pode_ver_historico": cargo.pode_ver_historico if cargo else (current_user.role == "admin"),
        "pode_gerenciar_usuarios": cargo.pode_gerenciar_usuarios if cargo else (current_user.role == "admin"),
        "pode_importar_sap": cargo.pode_importar_sap if cargo else (current_user.role in ("admin", "programador")),
        "pode_configurar_parametros": cargo.pode_configurar_parametros if cargo else (current_user.role == "admin"),
        "pode_gerenciar_ferramentaria": cargo.pode_gerenciar_ferramentaria if cargo else (current_user.role in ("admin", "programador_ferramentaria")),
        "pode_gerenciar_linhas": cargo.pode_gerenciar_linhas if cargo else (current_user.role == "admin"),
        "pode_ver_solda": cargo.pode_ver_solda if cargo else (current_user.role != "operador_estamparia"),
        "pode_ver_estamparia": cargo.pode_ver_estamparia if cargo else (current_user.role != "operador_solda"),
    }
    if current_user.role == "admin":
        for k in permissoes:
            permissoes[k] = True

    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role,
        "permissoes": permissoes,
    }

