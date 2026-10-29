from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_anexos import router as anexos_router
from app.api.routes_auditoria import router as auditoria_router
from app.api.routes_auth import router as auth_router
from app.api.routes_checklist import router as checklist_router
from app.api.routes_colunas_extras import router as colunas_extras_router
from app.api.routes_comentarios import router as comentarios_router
from app.api.routes_dashboard import router as dashboard_router
from app.api.routes_exportacao import router as exportacao_router
from app.api.routes_ferramentaria import router as ferramentaria_router
from app.api.routes_import import router as import_router
from app.api.routes_labels import router as labels_router
from app.api.routes_linhas import router as linhas_router
from app.api.routes_parametros import router as parametros_router
from app.api.routes_producao import router as producao_router
from app.api.routes_tabela_b import router as tabela_b_router
from app.api.routes_users import router as users_router
from app.api.routes_ws import router as ws_router
from app.core.config import get_settings

app = FastAPI(title="plannerLogistica")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(linhas_router)
app.include_router(producao_router)
app.include_router(auditoria_router, prefix="/auditoria", tags=["auditoria"])
app.include_router(checklist_router)
app.include_router(labels_router)
app.include_router(comentarios_router)
app.include_router(anexos_router)
app.include_router(dashboard_router)
app.include_router(tabela_b_router)
app.include_router(exportacao_router)
app.include_router(import_router)
app.include_router(colunas_extras_router)
app.include_router(parametros_router)
app.include_router(ferramentaria_router)
app.include_router(ws_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


# Se o frontend compilado (dist) estiver presente, serve como SPA
from pathlib import Path
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

DIST_DIR = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # Rotas reservadas para documentação Swagger/OpenAPI não devem servir o SPA
        clean_path = full_path.strip("/")
        if clean_path in ("docs", "redoc", "openapi.json") or clean_path.startswith(("docs/", "redoc/")):
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Use the FastAPI native documentation endpoints.")
        file_candidate = DIST_DIR / full_path
        if full_path and file_candidate.is_file():
            return FileResponse(file_candidate)
        return FileResponse(DIST_DIR / "index.html")
