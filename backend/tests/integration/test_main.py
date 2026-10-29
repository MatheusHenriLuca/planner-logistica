from fastapi.testclient import TestClient

from app.main import app


def test_health_check_returns_ok():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_cors_preflight_allows_configured_origin():
    # Regression guard for C1: the SPA (default Vite dev origin) must be able
    # to complete a CORS preflight against the API, or every browser request
    # is blocked before it ever reaches a route.
    client = TestClient(app)
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_preflight_rejects_unlisted_origin():
    # The allowlist must be explicit, not a wildcard - an origin that isn't
    # configured must not be reflected back as allowed.
    client = TestClient(app)
    response = client.options(
        "/health",
        headers={
            "Origin": "http://evil.example.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert "access-control-allow-origin" not in response.headers
