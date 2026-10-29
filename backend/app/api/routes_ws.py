from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy.exc import SQLAlchemyError

from app.core.security import decode_access_token
from app.core.ws_manager import manager
from app.db.session import SessionLocal
from app.models.user import User

router = APIRouter()


async def _usuario_do_token(token: str | None) -> User | None:
    if not token:
        return None
    try:
        payload = decode_access_token(token)
    except JWTError:
        return None
    username = payload.get("sub")
    if not username:
        return None
    db = SessionLocal()
    try:
        return db.query(User).filter(User.username == username).one_or_none()
    except SQLAlchemyError:
        return None
    finally:
        db.close()


@router.websocket("/ws/producao")
async def ws_producao(websocket: WebSocket) -> None:
    # Token vai na primeira mensagem apos conectar, nao na query string da
    # URL - URLs (WS incluido) podem parar em log de proxy/servidor; o
    # payload de uma mensagem, nao.
    await websocket.accept()
    try:
        token = await websocket.receive_text()
    except WebSocketDisconnect:
        return

    usuario = await _usuario_do_token(token)
    if usuario is None:
        await websocket.close(code=4401)
        return

    manager.registrar(websocket)
    try:
        while True:
            # Daqui em diante o cliente nunca manda nada relevante - so
            # mantem a conexao viva e deixa o await detectar a desconexao.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.desconectar(websocket)
