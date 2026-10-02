"""
explanation.py — Explainable AI module for tablet authentication verdicts.
Computes per-feature z-scores, status classifications, ablation impact scores,
and plain-English explanations.
"""

import numpy as np
from features import FEATURE_NAMES

FEATURE_GROUPS = {
    "Mean_R": "RGB", "Mean_G": "RGB", "Mean_B": "RGB",
    "R_G_Ratio": "Ratios", "G_B_Ratio": "Ratios", "R_B_Ratio": "Ratios",
    "Mean_H": "HSV", "Mean_S": "HSV", "Mean_V": "HSV",
    "Mean_Intensity": "Intensity", "Max_Intensity": "Intensity",
    "Min_Intensity": "Intensity", "Std_Intensity": "Intensity",
    "Contrast": "Texture", "Homogeneity": "Texture",
    "Glossiness": "Optical", "Specular_Ratio": "Optical"
}

FEATURE_LABELS = {
    "Mean_R": "Red intensity",
    "Mean_G": "Green intensity",
    "Mean_B": "Blue intensity",
    "R_G_Ratio": "Red/Green ratio",
    "G_B_Ratio": "Green/Blue ratio",
    "R_B_Ratio": "Red/Blue ratio",
    "Mean_H": "Color hue",
    "Mean_S": "Color saturation",
    "Mean_V": "Brightness value",
    "Mean_Intensity": "Average luminance",
    "Max_Intensity": "Peak luminance",
    "Min_Intensity": "Base luminance",
    "Std_Intensity": "Luminance uniformity",
    "Contrast": "Surface texture contrast",
    "Homogeneity": "Texture homogeneity",
    "Glossiness": "Surface shininess",
    "Specular_Ratio": "Specular highlight ratio"
}

FEATURE_SENTENCES = {
    "Glossiness": {
        "high": "Surface is much shinier than genuine tablets",
        "low": "Surface is much duller and less glossy than genuine tablets"
    },
    "Specular_Ratio": {
        "high": "Excessive specular highlights and surface reflection spots",
        "low": "Lacks the characteristic specular highlights of reference tablets"
    },
    "Contrast": {
        "high": "Surface texture is coarser and less uniform than genuine tablets",
        "low": "Surface texture is unusually flat compared to genuine tablets"
    },
    "Homogeneity": {
        "high": "Texture pattern lacks standard grain variation",
        "low": "Surface grain lacks standard pharmaceutical homogeneity"
    },
    "R_G_Ratio": {
        "high": "Color is significantly redder than genuine tablets",
        "low": "Color is less red-yellow than genuine tablets"
    },
    "G_B_Ratio": {
        "high": "Green-to-blue balance is higher than genuine reference tablets",
        "low": "Green-to-blue balance is lower than genuine reference tablets"
    },
    "R_B_Ratio": {
        "high": "Red-to-blue spectral balance exceeds genuine reference tablets",
        "low": "Red-to-blue spectral balance is below genuine reference tablets"
    },
    "Mean_H": {
        "high": "Color hue angle deviates significantly from genuine tablets",
        "low": "Color hue angle deviates significantly from genuine tablets"
    },
    "Mean_S": {
        "high": "Color saturation is much deeper than genuine tablets",
        "low": "Color saturation is faded or washed out compared to genuine tablets"
    },
    "Mean_V": {
        "high": "Overall color brightness is higher than genuine tablets",
        "low": "Overall color brightness is darker than genuine tablets"
    },
    "Mean_R": {
        "high": "Red spectral channel is higher than genuine reference tablets",
        "low": "Red spectral component is lower than genuine tablets"
    },
    "Mean_G": {
        "high": "Green spectral channel is higher than genuine reference tablets",
        "low": "Green spectral component is lower than genuine tablets"
    },
    "Mean_B": {
        "high": "Blue spectral channel is higher than genuine reference tablets",
        "low": "Blue spectral component is lower than genuine tablets"
    },
    "Mean_Intensity": {
        "high": "Overall surface intensity is brighter than reference tablets",
        "low": "Overall surface intensity is darker than reference tablets"
    },
    "Max_Intensity": {
        "high": "Peak highlight intensity is abnormally bright",
        "low": "Peak highlight intensity is unusually low"
    },
    "Min_Intensity": {
        "high": "Base shadow level is higher than reference tablets",
        "low": "Shadows or porosity pits are deeper than reference tablets"
    },
    "Std_Intensity": {
        "high": "Surface intensity distribution is more erratic than genuine tablets",
        "low": "Surface intensity distribution lacks standard variation"
    }
}


def compute_explanation(vec: np.ndarray, model, scaler, condition_meta: dict) -> dict:
    """
    Computes explainability payload for a single prediction:
    1. Feature z-scores against genuine training distribution: z = (x - mean) / std (clamped to [-4, 4]).
    2. Status: normal (within p5..p95), borderline (within 2*std outside), abnormal (> 2*std outside).
    3. Feature ablation impact: replace single feature with genuine median, re-score, measure score change.
    4. Top 3 ranked reasons with human-friendly descriptions.

    Note: With small training sets, sample standard deviation carries statistical uncertainty.
    """
    feat_stats = condition_meta.get("feature_stats", {})
    x_raw = vec.astype(np.float64)

    # 1. Base prediction score
    x_scaled = scaler.transform(x_raw.reshape(1, -1))
    base_score = float(model.decision_function(x_scaled)[0])

    features_detail = []
    top_candidates = []

    # Pre-compute genuine medians vector for ablation
    medians_vec = np.zeros(len(FEATURE_NAMES), dtype=np.float64)
    for idx, f_name in enumerate(FEATURE_NAMES):
        medians_vec[idx] = feat_stats.get(f_name, {}).get("p50", x_raw[idx])

    # 2. Iterate each feature
    for idx, f_name in enumerate(FEATURE_NAMES):
        val = float(x_raw[idx])
        stats = feat_stats.get(f_name, {"mean": val, "std": 1.0, "p5": val, "p95": val, "p50": val})
        mean = float(stats.get("mean", val))
        std = float(stats.get("std", 1.0))
        std = std if std > 1e-6 else 1.0
        p5 = float(stats.get("p5", mean - 1.645 * std))
        p95 = float(stats.get("p95", mean + 1.645 * std))
        p50 = float(stats.get("p50", mean))

        # Z-score capped at +-4.0
        raw_z = (val - mean) / std
        clamped_z = round(float(np.clip(raw_z, -4.0, 4.0)), 2)

        # Status: normal, borderline, abnormal
        if p5 <= val <= p95:
            status = "normal"
        elif (p5 - 2.0 * std) <= val <= (p95 + 2.0 * std):
            status = "borderline"
        else:
            status = "abnormal"

        # Ablation test: replace single feature with genuine median and re-score
        ablated_vec = x_raw.copy()
        ablated_vec[idx] = p50
        ablated_scaled = scaler.transform(ablated_vec.reshape(1, -1))
        ablated_score = float(model.decision_function(ablated_scaled)[0])
        impact = round(max(0.0, ablated_score - base_score), 4)

        direction = "high" if raw_z >= 0 else "low"
        sentences = FEATURE_SENTENCES.get(f_name, {})
        reason_text = sentences.get(direction, f"{f_name} is abnormally {direction}")

        detail = {
            "name": f_name,
            "label": FEATURE_LABELS.get(f_name, f_name),
            "group": FEATURE_GROUPS.get(f_name, "General"),
            "value": round(val, 3),
            "z": clamped_z,
            "impact": impact,
            "genuine_mean": round(mean, 3),
            "genuine_p5": round(p5, 3),
            "genuine_p95": round(p95, 3),
            "status": status,
            "direction": direction,
            "text": reason_text
        }
        features_detail.append(detail)

        # Candidate for top reasons
        top_candidates.append({
            "feature": f_name,
            "label": FEATURE_LABELS.get(f_name, f_name),
            "z": clamped_z,
            "direction": direction,
            "impact": impact,
            "text": reason_text,
            "abs_z": abs(clamped_z),
            "status": status
        })

    # Rank top reasons: sort primarily by ablation impact, secondarily by |z|
    top_candidates.sort(key=lambda item: (item["impact"], item["abs_z"]), reverse=True)
    top_reasons = top_candidates[:3]

    return {
        "method": "zscore+ablation",
        "top_reasons": top_reasons,
        "features": features_detail,
        "note": "Reference statistics computed from genuine tablets. Variance carries small-sample uncertainty."
    }
