"""
test_predict.py — API tests for POST /predict endpoint
"""

import io
import os
import sys
import cv2
import numpy as np
import pytest

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app import app


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def make_test_image_bytes(color=(210, 210, 210), size=(300, 300)):
    img = np.full((size[1], size[0], 3), 190, dtype=np.uint8)
    cv2.circle(img, (size[0] // 2, size[1] // 2), size[0] // 3, color, -1)
    noise = np.random.normal(0, 10, img.shape).astype(np.int16)
    img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


def test_predict_happy_path(client):
    img_bytes = make_test_image_bytes()
    data = {
        "image": (io.BytesIO(img_bytes), "sample_tablet.jpg", "image/jpeg"),
        "medicine_name": "Paracetamol 500mg",
        "batch_id": "BATCH123",
        "shot_type": "flash_off",
        "angle": "top"
    }
    res = client.post("/predict", data=data, content_type="multipart/form-data")
    assert res.status_code == 200
    json_data = res.get_json()

    # Validate response schema
    assert "scan_id" in json_data
    assert "timestamp" in json_data
    assert json_data["medicine_name"] == "Paracetamol 500mg"
    assert json_data["batch_id"] == "BATCH123"
    assert json_data["result"] in ["Genuine", "Fake", "Inconclusive"]
    assert json_data["label_code"] in [1, -1, 0]
    assert 0.01 <= json_data["confidence"] <= 0.99
    assert "decision_score" in json_data
    assert "anomaly_score" in json_data
    assert len(json_data["features"]) == 17
    assert "explanation" in json_data
    assert "top_reasons" in json_data["explanation"]
    assert "quality" in json_data
    assert "model" in json_data
    assert json_data["model"]["condition"] == "flash_off"


def test_predict_missing_image(client):
    res = client.post("/predict", data={"medicine_name": "Test"}, content_type="multipart/form-data")
    assert res.status_code == 400
    assert "error" in res.get_json()


def test_predict_empty_image(client):
    data = {
        "image": (io.BytesIO(b""), "empty.jpg", "image/jpeg")
    }
    res = client.post("/predict", data=data, content_type="multipart/form-data")
    assert res.status_code == 400


def test_predict_unsupported_format(client):
    data = {
        "image": (io.BytesIO(b"dummy text"), "file.txt", "text/plain")
    }
    res = client.post("/predict", data=data, content_type="multipart/form-data")
    assert res.status_code == 415


def test_predict_severely_dark_returns_inconclusive(client):
    # Severely underexposed image
    dark_img = np.full((200, 200, 3), 10, dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", dark_img)

    data = {
        "image": (io.BytesIO(buf.tobytes()), "dark.jpg", "image/jpeg"),
        "medicine_name": "Paracetamol"
    }
    res = client.post("/predict", data=data, content_type="multipart/form-data")
    assert res.status_code == 200
    json_data = res.get_json()
    assert json_data["result"] == "Inconclusive"
    assert json_data["label_code"] == 0
