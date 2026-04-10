"""
=============================================================
  features.py  —  Shared Feature Extraction Module
  Hardware-Free Computational Spectral Authentication System
=============================================================
  Imported by BOTH training.py AND app.py.
  Feature order EXACTLY matches dataset columns:
    Mean_R, Mean_G, Mean_B,
    R_G_Ratio, G_B_Ratio, R_B_Ratio,
    Mean_H, Mean_S, Mean_V,
    Contrast, Homogeneity,
    Mean_Intensity, Max_Intensity, Min_Intensity, Std_Intensity,
    Glossiness, Specular_Ratio
"""

import cv2
import numpy as np
from skimage.feature import graycomatrix, graycoprops

# ── Canonical feature order ───────────────────────────────────────────────────
FEATURE_NAMES = [
    "Mean_R", "Mean_G", "Mean_B",
    "R_G_Ratio", "G_B_Ratio", "R_B_Ratio",
    "Mean_H", "Mean_S", "Mean_V",
    "Contrast", "Homogeneity",
    "Mean_Intensity", "Max_Intensity", "Min_Intensity", "Std_Intensity",
    "Glossiness", "Specular_Ratio",
]

TARGET_SIZE = (224, 224)   # all images resized to this before feature extraction


def preprocess_image(img_bgr: np.ndarray) -> np.ndarray:
    """
    Resize  →  Gaussian denoise  →  CLAHE illumination normalisation.
    Returns a BGR uint8 image of size TARGET_SIZE.
    """
    img = cv2.resize(img_bgr, TARGET_SIZE, interpolation=cv2.INTER_AREA)
    img = cv2.GaussianBlur(img, (3, 3), 0)   # gentle noise removal

    # Normalise lighting with CLAHE on the L channel
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l_ch, a_ch, b_ch = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    lab   = cv2.merge([clahe.apply(l_ch), a_ch, b_ch])
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


def _ratio(a: float, b: float) -> float:
    return float(a) / (float(b) + 1e-6)


def extract_features(img_bgr: np.ndarray) -> np.ndarray:
    """
    BGR image  →  1-D float64 array of shape (17,).
    Feature order matches FEATURE_NAMES.
    """
    img = preprocess_image(img_bgr)

    h, w = img.shape[:2]
    mh, mw = int(h * 0.10), int(w * 0.10)   # 10% margin = 80% centre crop

    # ── RGB ──────────────────────────────────────────────────────────────────
    rgb  = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32)
    crop = rgb[mh:h-mh, mw:w-mw]
    Mean_R = float(np.mean(crop[:, :, 0]))
    Mean_G = float(np.mean(crop[:, :, 1]))
    Mean_B = float(np.mean(crop[:, :, 2]))

    # ── Ratios ────────────────────────────────────────────────────────────────
    R_G_Ratio = _ratio(Mean_R, Mean_G)
    G_B_Ratio = _ratio(Mean_G, Mean_B)
    R_B_Ratio = _ratio(Mean_R, Mean_B)

    # ── HSV ───────────────────────────────────────────────────────────────────
    hsv      = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
    crop_hsv = hsv[mh:h-mh, mw:w-mw]
    Mean_H = float(np.mean(crop_hsv[:, :, 0]))
    Mean_S = float(np.mean(crop_hsv[:, :, 1]))
    Mean_V = float(np.mean(crop_hsv[:, :, 2]))

    # ── Intensity (grayscale) ─────────────────────────────────────────────────
    gray      = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    crop_gray = gray[mh:h-mh, mw:w-mw]
    Mean_Intensity = float(np.mean(crop_gray))
    Max_Intensity  = float(np.max(crop_gray))
    Min_Intensity  = float(np.min(crop_gray))
    Std_Intensity  = float(np.std(crop_gray))

    # ── GLCM Texture ──────────────────────────────────────────────────────────
    gray_u8 = crop_gray.clip(0, 255).astype(np.uint8)
    glcm = graycomatrix(
        gray_u8, distances=[1],
        angles=[0, np.pi/4, np.pi/2, 3*np.pi/4],
        levels=256, symmetric=True, normed=True
    )
    Contrast    = float(graycoprops(glcm, "contrast").mean())
    Homogeneity = float(graycoprops(glcm, "homogeneity").mean())

    # ── Optical / Surface ─────────────────────────────────────────────────────
    # Glossiness  ≈ std-dev of bright specular pixels in V channel
    bright = crop_hsv[:, :, 2] > 200
    Glossiness = float(np.std(crop_hsv[:, :, 2][bright])) if bright.sum() > 10 else 0.0

    # Specular_Ratio  ≈ fraction of pixels that are specular highlights
    Specular_Ratio = float(bright.sum()) / float(crop.shape[0] * crop.shape[1] + 1e-6)

    # ── Assemble ──────────────────────────────────────────────────────────────
    return np.array([
        Mean_R, Mean_G, Mean_B,
        R_G_Ratio, G_B_Ratio, R_B_Ratio,
        Mean_H, Mean_S, Mean_V,
        Contrast, Homogeneity,
        Mean_Intensity, Max_Intensity, Min_Intensity, Std_Intensity,
        Glossiness, Specular_Ratio,
    ], dtype=np.float64)


def extract_features_from_bytes(image_bytes: bytes) -> np.ndarray:
    """Flask-friendly wrapper: raw bytes → feature vector."""
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Cannot decode image. Send a JPEG, PNG, or WEBP file.")
    return extract_features(img)


def feature_dict(vec: np.ndarray) -> dict:
    """Feature vector → labelled dict for JSON responses."""
    return {k: round(float(v), 4) for k, v in zip(FEATURE_NAMES, vec)}