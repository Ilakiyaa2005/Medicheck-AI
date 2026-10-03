"""
test_quality.py — Unit tests for server-side image quality gate
"""

import numpy as np
import cv2
import pytest
import os, sys

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from quality import assess_image_quality, compute_brightness, compute_blur, compute_glare_fraction, detect_human_face


def test_quality_good_tablet_image():
    # Good, clear tablet on plain light background
    img = np.full((300, 300, 3), 180, dtype=np.uint8)
    cv2.circle(img, (150, 150), 80, (230, 230, 225), -1)
    # Add clear surface texture
    noise = np.random.normal(0, 15, (300, 300, 3)).astype(np.int16)
    img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    q = assess_image_quality(img)
    assert q["brightness"] > 60.0
    assert q["glare_fraction"] < 0.05
    assert q["score"] > 0.4
    assert not q["is_severe"]


def test_quality_severely_dark_image():
    # Very dark image (< 35 brightness)
    dark_img = np.full((300, 300, 3), 15, dtype=np.uint8)
    q = assess_image_quality(dark_img)
    assert not q["ok"]
    assert q["is_severe"]
    assert any("dark" in iss.lower() or "underexposed" in iss.lower() for iss in q["issues"])


def test_quality_excessive_glare():
    # Image with > 20% saturated glare
    glare_img = np.full((300, 300, 3), 150, dtype=np.uint8)
    glare_img[100:220, 100:220] = [255, 255, 255]
    q = assess_image_quality(glare_img)
    assert not q["ok"]
    assert any("glare" in iss.lower() for iss in q["issues"])


def test_quality_severely_blurry():
    # Uniform flat image (zero texture / extreme blur)
    flat_img = np.full((300, 300, 3), 140, dtype=np.uint8)
    q = assess_image_quality(flat_img)
    assert not q["ok"]
    assert q["blur_score"] < 10.0


def test_detect_human_face_on_tablet():
    # Tablet image should NOT trigger face detector
    img = np.full((300, 300, 3), 180, dtype=np.uint8)
    cv2.circle(img, (150, 150), 80, (230, 230, 225), -1)
    assert not detect_human_face(img)

