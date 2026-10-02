"""
test_predict_multi.py — API tests for POST /predict-multi endpoint
"""

import io
import json
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


def test_predict_multi_two_shots(client):
    img1 = make_test_image_bytes(color=(200, 200, 200))
    img2 = make_test_image_bytes(color=(205, 205, 205))

    shots_meta = [
        {"shot_type": "flash_off", "angle": "top"},
        {"shot_type": "flash_on", "angle": "top"}
    ]

    data = {
        "images": [
            (io.BytesIO(img1), "shot1.jpg", "image/jpeg"),
            (io.BytesIO(img2), "shot2.jpg", "image/jpeg"),
        ],
        "shots_meta": json.dumps(shots_meta),
        "medicine_name": "Amoxicillin",
        "batch_id": "AMX-99"
    }

    res = client.post("/predict-multi", data=data, content_type="multipart/form-data")
    assert res.status_code == 200
    json_data = res.get_json()

    assert "result" in json_data
    assert json_data["result"] in ["Genuine", "Fake", "Inconclusive"]
    assert "shots" in json_data
    assert len(json_data["shots"]) == 2
    assert "agreement" in json_data
    assert "combined_method" in json_data
    assert "mean" in json_data["combined_method"]


def test_predict_multi_three_shots(client):
    img1 = make_test_image_bytes(color=(200, 200, 200))
    img2 = make_test_image_bytes(color=(205, 205, 205))
    img3 = make_test_image_bytes(color=(210, 210, 210))

    shots_meta = [
        {"shot_type": "flash_off", "angle": "top"},
        {"shot_type": "flash_on", "angle": "top"},
        {"shot_type": "flash_off", "angle": "bottom"}
    ]

    data = {
        "images": [
            (io.BytesIO(img1), "shot1.jpg", "image/jpeg"),
            (io.BytesIO(img2), "shot2.jpg", "image/jpeg"),
            (io.BytesIO(img3), "shot3.jpg", "image/jpeg"),
        ],
        "shots_meta": json.dumps(shots_meta),
        "medicine_name": "Cefixime",
        "batch_id": "CEF-42"
    }

    res = client.post("/predict-multi", data=data, content_type="multipart/form-data")
    assert res.status_code == 200
    json_data = res.get_json()

    assert len(json_data["shots"]) == 3
    assert "median" in json_data["combined_method"]


def test_predict_multi_requires_at_least_two_images(client):
    img1 = make_test_image_bytes()
    data = {
        "images": [
            (io.BytesIO(img1), "single.jpg", "image/jpeg"),
        ],
        "medicine_name": "Single Shot"
    }
    res = client.post("/predict-multi", data=data, content_type="multipart/form-data")
    assert res.status_code == 400
    assert "error" in res.get_json()
