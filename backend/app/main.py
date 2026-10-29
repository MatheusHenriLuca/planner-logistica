from pathlib import Path
from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

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


def _register_routers(target):
    target.include_router(auth_router)
    target.include_router(users_router)
    target.include_router(linhas_router)
    target.include_router(producao_router)
    target.include_router(auditoria_router, prefix="/auditoria", tags=["auditoria"])
    target.include_router(checklist_router)
    target.include_router(labels_router)
    target.include_router(comentarios_router)
    target.include_router(anexos_router)
    target.include_router(dashboard_router)
    target.include_router(tabela_b_router)
    target.include_router(exportacao_router)
    target.include_router(import_router)
    target.include_router(colunas_extras_router)
    target.include_router(parametros_router)
    target.include_router(ferramentaria_router)
    target.include_router(ws_router)


_register_routers(app)

api_router = APIRouter(prefix="/api")
_register_routers(api_router)
app.include_router(api_router)


@app.get("/health")
@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


# Se o frontend compilado (dist) estiver presente, serve como SPA
DIST_DIR = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")


@app.middleware("http")
async def spa_html_navigation_middleware(request: Request, call_next):
    if (
        request.method == "GET"
        and DIST_DIR.is_dir()
        and "text/html" in request.headers.get("accept", "")
    ):
        clean_path = request.url.path.strip("/")
        if not clean_path.startswith(("api/", "docs", "redoc", "openapi.json", "assets/")) and clean_path not in (
            "api",
            "docs",
            "redoc",
            "openapi.json",
            "health",
        ):
            file_candidate = DIST_DIR / clean_path
            if clean_path and file_candidate.is_file():
                return FileResponse(file_candidate)
            return FileResponse(DIST_DIR / "index.html")
    return await call_next(request)


@app.api_route("/{full_path:path}", methods=["GET", "HEAD"])
def serve_spa(full_path: str):
    if not DIST_DIR.is_dir():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not Found")
    # Rotas reservadas para documentação Swagger/OpenAPI não devem servir o SPA
    clean_path = full_path.strip("/")
    if clean_path in ("docs", "redoc", "openapi.json") or clean_path.startswith(("docs/", "redoc/")):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Use the FastAPI native documentation endpoints.")
    file_candidate = DIST_DIR / full_path
    if full_path and file_candidate.is_file():
        return FileResponse(file_candidate)
    return FileResponse(DIST_DIR / "index.html")
