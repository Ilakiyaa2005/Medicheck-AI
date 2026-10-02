"""
test_explanation.py — Unit tests for explanation payload structure and ranking
"""

import numpy as np
import pytest
import os, sys

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from explanation import compute_explanation
from app import MODELS, SCALERS, MODEL_META


def test_explanation_structure():
    model = MODELS.get("pooled")
    scaler = SCALERS.get("pooled")
    cond_meta = MODEL_META.get("conditions", {}).get("pooled", {})

    assert model is not None
    assert scaler is not None

    # Reference genuine-like vector
    gen_means = [cond_meta["feature_stats"][k]["mean"] for k in MODEL_META["feature_names"]]
    vec = np.array(gen_means, dtype=np.float64)

    expl = compute_explanation(vec, model, scaler, cond_meta)
    assert expl["method"] == "zscore+ablation"
    assert "top_reasons" in expl
    assert len(expl["top_reasons"]) <= 3
    assert len(expl["features"]) == 17

    # Check first feature detail schema
    feat0 = expl["features"][0]
    assert "name" in feat0
    assert "group" in feat0
    assert "value" in feat0
    assert "z" in feat0
    assert "status" in feat0
    assert feat0["status"] in ["normal", "borderline", "abnormal"]
    assert -4.0 <= feat0["z"] <= 4.0


def test_explanation_detects_abnormal_glossiness():
    model = MODELS.get("pooled")
    scaler = SCALERS.get("pooled")
    cond_meta = MODEL_META.get("conditions", {}).get("pooled", {})

    gen_means = [cond_meta["feature_stats"][k]["mean"] for k in MODEL_META["feature_names"]]
    vec = np.array(gen_means, dtype=np.float64)

    # Spike glossiness to abnormal level
    gloss_idx = MODEL_META["feature_names"].index("Glossiness")
    vec[gloss_idx] = 95.0

    expl = compute_explanation(vec, model, scaler, cond_meta)
    gloss_feat = next(f for f in expl["features"] if f["name"] == "Glossiness")
    assert gloss_feat["status"] == "abnormal"
    assert gloss_feat["direction"] == "high"
