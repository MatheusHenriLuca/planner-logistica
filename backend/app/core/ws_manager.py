from fastapi import WebSocket


class ConnectionManager:
    """In-memory registry of live WebSocket connections for one process.

    No Redis/pub-sub - this app runs as a single process and the
    connection count is small (a handful of factory-floor terminals),
    so a plain list is enough. See the Fase 3.5c spec for why this
    wasn't built as a multi-process broadcaster.
    """

    def __init__(self) -> None:
        self._conexoes: list[WebSocket] = []

    def registrar(self, websocket: WebSocket) -> None:
        self._conexoes.append(websocket)

    def desconectar(self, websocket: WebSocket) -> None:
        if websocket in self._conexoes:
            self._conexoes.remove(websocket)

    async def broadcast(self, mensagem: dict) -> None:
        mortas: list[WebSocket] = []
        for conexao in self._conexoes:
            try:
                await conexao.send_json(mensagem)
            except Exception:  # noqa: BLE001 - a dead/broken socket must not stop the rest of the broadcast
                mortas.append(conexao)
        for conexao in mortas:
            self.desconectar(conexao)


manager = ConnectionManager()
