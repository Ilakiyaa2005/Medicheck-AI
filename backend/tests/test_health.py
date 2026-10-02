"""
test_health.py — Health and metadata endpoint test
"""

import pytest
import os, sys

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app import app


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_health_check(client):
    res = client.get("/")
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "online"
    assert "models_loaded" in data
    assert len(data["models_loaded"]) > 0
    assert "meta" in data
    assert len(data["meta"]["feature_names"]) == 17
