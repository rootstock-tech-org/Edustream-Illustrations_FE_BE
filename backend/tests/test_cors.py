from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app

client = TestClient(app)


def test_allowed_origin_receives_cors_header_on_health() -> None:
    origin = get_settings().cors_origins[0]

    response = client.get("/health", headers={"Origin": origin})

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


def test_preflight_request_is_allowed_for_scene_endpoint() -> None:
    origin = get_settings().cors_origins[0]

    response = client.options(
        "/api/scene/generate",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


def test_disallowed_origin_gets_no_cors_header() -> None:
    response = client.get("/health", headers={"Origin": "http://evil.example.com"})

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers
