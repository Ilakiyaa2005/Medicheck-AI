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


def isolate_tablet_roi(img_bgr: np.ndarray) -> np.ndarray:
    """
    Attempts to locate and crop the foreground tablet from its background.
    If the image already tightly frames the tablet or background segmentation fails,
    returns the original image.
    """
    if img_bgr is None or img_bgr.size == 0:
        return img_bgr

    h, w = img_bgr.shape[:2]
    if h < 20 or w < 20:
        return img_bgr

    # Estimate background from borders (outer 12% perimeter)
    border_mask = np.ones((h, w), dtype=bool)
    border_mask[int(h * 0.12):int(h * 0.88), int(w * 0.12):int(w * 0.88)] = False
    border_pixels = img_bgr[border_mask]
    if len(border_pixels) == 0:
        return img_bgr

    bg_bgr = np.median(border_pixels, axis=0)
    diff = np.linalg.norm(img_bgr.astype(np.float32) - bg_bgr, axis=2)
    fg_thresh = max(24.0, float(np.mean(diff) + 0.4 * np.std(diff)))
    fg_mask = (diff > fg_thresh).astype(np.uint8) * 255

    kernel_size = max(3, int(min(h, w) * 0.02))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, kernel)
    fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel)

    contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return img_bgr

    min_area = (h * w) * 0.005
    max_area = (h * w) * 0.95
    valid_candidates = []

    for c in contours:
        area = cv2.contourArea(c)
        if min_area <= area <= max_area:
            x, y, cw, ch = cv2.boundingRect(c)
            cx, cy = x + cw / 2.0, y + ch / 2.0
            if 0.08 * w < cx < 0.92 * w and 0.08 * h < cy < 0.92 * h:
                valid_candidates.append((area, (x, y, cw, ch)))

    if not valid_candidates:
        return img_bgr

    valid_candidates.sort(key=lambda item: item[0], reverse=True)
    best_area, (bx, by, bw, bh) = valid_candidates[0]

    pad = int(min(bw, bh) * 0.05)
    x1 = max(0, bx - pad)
    y1 = max(0, by - pad)
    x2 = min(w, bx + bw + pad)
    y2 = min(h, by + bh + pad)

    cropped = img_bgr[y1:y2, x1:x2]
    return cropped if cropped.size > 0 else img_bgr


def extract_features(img_bgr: np.ndarray) -> np.ndarray:
    """
    BGR image  →  1-D float64 array of shape (17,).
    Feature order matches FEATURE_NAMES.
    """
    # 1. First isolate foreground tablet if distinct from background
    tablet_img = isolate_tablet_roi(img_bgr)
    img = preprocess_image(tablet_img)

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
    Mean_S = float(np.mean(crop_hsv[:, :, 1])) / 255.0
    Mean_V = float(np.mean(crop_hsv[:, :, 2])) / 255.0

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