"""
quality.py — Server-side image quality gate for tablet photos.
Mirrors browser-side quality checks (qualityConfig.js) to catch blurry,
over/underexposed, or improperly framed tablet photos before inference.
"""

import cv2
import numpy as np

QUALITY_CONFIG = {
    "brightness_min": 60.0,
    "brightness_max": 215.0,
    "blur_threshold": 45.0,        # Laplacian variance threshold
    "glare_max_fraction": 0.04,    # > 4% saturated pixels
    "fill_min_ratio": 0.15,        # < 15% center ROI filled = too far
    "fill_max_ratio": 0.92,        # > 92% center ROI filled = clipped/too close
}


def compute_brightness(img_bgr: np.ndarray) -> float:
    """Mean luminance across the image (or center ROI)."""
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    return float(np.mean(gray))


def compute_blur(img_bgr: np.ndarray) -> float:
    """
    Variance of 3x3 Laplacian on grayscale.
    Normalized to 224x224 resolution so thresholds remain stable across cameras.
    """
    h, w = img_bgr.shape[:2]
    # Resize to standard analysis resolution if necessary
    if (w, h) != (224, 224):
        target = cv2.resize(img_bgr, (224, 224), interpolation=cv2.INTER_AREA)
    else:
        target = img_bgr
    gray = cv2.cvtColor(target, cv2.COLOR_BGR2GRAY)
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    return float(laplacian.var())


def compute_glare_fraction(img_bgr: np.ndarray) -> float:
    """Fraction of near-saturated pixels (>250 in R, G, and B)."""
    r_sat = img_bgr[:, :, 2] > 250
    g_sat = img_bgr[:, :, 1] > 250
    b_sat = img_bgr[:, :, 0] > 250
    all_sat = r_sat & g_sat & b_sat
    total_pixels = img_bgr.shape[0] * img_bgr.shape[1]
    return float(np.sum(all_sat)) / float(total_pixels + 1e-6)


def compute_fill_ratio(img_bgr: np.ndarray) -> float:
    """
    Estimates tablet fill ratio in center region.
    Uses Otsu thresholding / edge density to separate tablet foreground from background.
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    # Estimate background from borders (top 10% and bottom 10%)
    h, w = gray.shape
    border_pixels = np.concatenate([gray[:int(h*0.1), :].flatten(), gray[int(h*0.9):, :].flatten()])
    bg_median = np.median(border_pixels)

    # Pixels that differ noticeably from border background belong to tablet
    diff = np.abs(gray.astype(np.float32) - bg_median)
    fg_mask = diff > 25.0
    return float(np.mean(fg_mask))


def assess_image_quality(img_bgr: np.ndarray) -> dict:
    """
    Runs full quality pipeline on an image.
    Returns:
      {
        "ok": bool,
        "score": float in [0, 1],
        "brightness": float,
        "blur_score": float,
        "glare_fraction": float,
        "fill_ratio": float,
        "issues": list[str],
        "is_severe": bool
      }
    """
    if img_bgr is None or img_bgr.size == 0:
        return {
            "ok": False,
            "score": 0.0,
            "brightness": 0.0,
            "blur_score": 0.0,
            "glare_fraction": 0.0,
            "fill_ratio": 0.0,
            "issues": ["Empty or unreadable image"],
            "is_severe": True,
        }

    h, w = img_bgr.shape[:2]
    # Analyze center 80% region
    mh, mw = int(h * 0.10), int(w * 0.10)
    roi = img_bgr[mh:h-mh, mw:w-mw]

    brightness = compute_brightness(roi)
    blur_score = compute_blur(roi)
    glare_frac = compute_glare_fraction(roi)
    fill_ratio = compute_fill_ratio(roi)

    issues = []
    severe_issues = []

    # Brightness checks
    if brightness < QUALITY_CONFIG["brightness_min"]:
        issues.append(f"Photo is too dark (brightness {brightness:.1f} < {QUALITY_CONFIG['brightness_min']})")
        if brightness < 35.0:
            severe_issues.append("Photo is severely underexposed")
    elif brightness > QUALITY_CONFIG["brightness_max"]:
        issues.append(f"Photo is too bright / overexposed (brightness {brightness:.1f} > {QUALITY_CONFIG['brightness_max']})")
        if brightness > 240.0:
            severe_issues.append("Photo is washed out / severely overexposed")

    # Glare check
    if glare_frac > QUALITY_CONFIG["glare_max_fraction"]:
        issues.append(f"Excessive surface glare ({glare_frac*100:.1f}% saturated pixels)")
        if glare_frac > 0.15:
            severe_issues.append("Severe glare obscuring tablet features")

    # Blur check
    if blur_score < QUALITY_CONFIG["blur_threshold"]:
        issues.append(f"Image is blurry (focus score {blur_score:.1f} < {QUALITY_CONFIG['blur_threshold']})")
        if blur_score < 15.0:
            severe_issues.append("Severely out of focus")

    # Fill ratio
    if fill_ratio < QUALITY_CONFIG["fill_min_ratio"]:
        issues.append("Tablet is too small in frame — move closer")
    elif fill_ratio > QUALITY_CONFIG["fill_max_ratio"]:
        issues.append("Tablet exceeds guide bounds — move back slightly")

    # Compute continuous quality score [0, 1]
    b_score = 1.0 - min(abs(brightness - 140.0) / 120.0, 1.0)
    f_score = min(blur_score / (QUALITY_CONFIG["blur_threshold"] * 2.0), 1.0)
    g_score = max(0.0, 1.0 - (glare_frac / (QUALITY_CONFIG["glare_max_fraction"] * 2.5)))
    overall_score = round(float(0.4 * b_score + 0.4 * f_score + 0.2 * g_score), 3)
    overall_score = max(0.0, min(1.0, overall_score))

    ok = len(issues) == 0

    return {
        "ok": ok,
        "score": overall_score,
        "brightness": round(brightness, 1),
        "blur_score": round(blur_score, 1),
        "glare_fraction": round(glare_frac, 4),
        "fill_ratio": round(fill_ratio, 3),
        "issues": issues,
        "is_severe": len(severe_issues) > 0,
    }
