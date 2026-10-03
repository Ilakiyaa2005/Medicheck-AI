"""
test_feature_parity.py — Parity test between training dataset features and serving extractor.
Prevents train/serve skew and specifically checks the HSV bug (Mean_S, Mean_V, Mean_H).
"""

import os
import sys
import numpy as np
import pandas as pd
import pytest
import cv2

# Add backend directory to sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import features


def get_dataset_df():
    """Load dataset used for training."""
    candidates = [
        os.path.join(backend_dir, "updated_pharma_dataset.csv"),
        os.path.join(backend_dir, "pharma_dataset.csv"),
    ]
    for p in candidates:
        if os.path.exists(p):
            return pd.read_csv(p, encoding="utf-8-sig", engine="python", on_bad_lines="skip")
    pytest.skip("No dataset CSV found for parity comparison")


def create_sample_images():
    """Generate realistic synthetic tablet images across various shades and lighting."""
    imgs = []

    # 1. White/off-white round tablet on light background
    img1 = np.full((300, 300, 3), 200, dtype=np.uint8)
    cv2.circle(img1, (150, 150), 90, (240, 240, 235), -1)
    cv2.circle(img1, (130, 130), 30, (255, 255, 255), -1)  # specular highlight
    imgs.append(("white_tablet", img1))

    # 2. Orange/reddish tablet
    img2 = np.full((300, 300, 3), 180, dtype=np.uint8)
    cv2.circle(img2, (150, 150), 85, (50, 100, 210), -1)   # BGR orange/red
    imgs.append(("orange_tablet", img2))

    # 3. Yellow/amber tablet
    img3 = np.full((300, 300, 3), 190, dtype=np.uint8)
    cv2.circle(img3, (150, 150), 95, (60, 210, 220), -1)   # BGR yellow
    imgs.append(("yellow_tablet", img3))

    return imgs


def test_hsv_scales_match_training_range():
    """Verify Mean_S and Mean_V are strictly in [0, 1] and Mean_H is in [0, 180]."""
    sample_images = create_sample_images()

    for name, img in sample_images:
        vec = features.extract_features(img)
        f_dict = features.feature_dict(vec)

        # Explicit check: Mean_S and Mean_V must NEVER exceed 1.0 (the HSV bug was returning ~50-200)
        assert 0.0 <= f_dict["Mean_S"] <= 1.0, (
            f"Mean_S scale mismatch for '{name}': got {f_dict['Mean_S']}, expected range [0, 1]."
        )
        assert 0.0 <= f_dict["Mean_V"] <= 1.0, (
            f"Mean_V scale mismatch for '{name}': got {f_dict['Mean_V']}, expected range [0, 1]."
        )
        assert 0.0 <= f_dict["Mean_H"] <= 180.0, (
            f"Mean_H scale mismatch for '{name}': got {f_dict['Mean_H']}, expected range [0, 180]."
        )


def test_all_features_within_sane_training_bounds():
    """Assert all 17 extracted features are within sane bounds of dataset distribution."""
    df = get_dataset_df()
    sample_images = create_sample_images()

    # Calculate statistics from dataset
    stats = {}
    for col in features.FEATURE_NAMES:
        assert col in df.columns, f"Feature '{col}' missing from training dataset!"
        vals = df[col].dropna()
        mean = float(vals.mean())
        std = float(vals.std()) if vals.std() > 1e-6 else 1.0
        vmin = float(vals.min())
        vmax = float(vals.max())
        stats[col] = (mean, std, vmin, vmax)

    for img_name, img in sample_images:
        vec = features.extract_features(img)
        assert len(vec) == 17, f"Expected 17 features, got {len(vec)}"

        for idx, col in enumerate(features.FEATURE_NAMES):
            val = float(vec[idx])
            mean, std, vmin, vmax = stats[col]

            # Allowed range: within [min - 5*std, max + 5*std] or non-negative where required
            margin = 5.0 * std
            lower_bound = vmin - margin
            upper_bound = vmax + margin

            # Certain features are strictly non-negative
            if col in ["Mean_R", "Mean_G", "Mean_B", "Mean_Intensity", "Max_Intensity",
                        "Min_Intensity", "Std_Intensity", "Contrast", "Homogeneity",
                        "Glossiness", "Specular_Ratio"]:
                lower_bound = max(0.0, lower_bound)

            assert lower_bound <= val <= upper_bound, (
                f"Feature parity failure for '{col}' on image '{img_name}': "
                f"Extracted={val:.4f}, training range=[{vmin:.4f}, {vmax:.4f}], "
                f"training mean={mean:.4f}, std={std:.4f}. Allowed bounds=[{lower_bound:.4f}, {upper_bound:.4f}]"
            )
