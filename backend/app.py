"""
=============================================================
  app.py — Flask REST API v2
  Hardware-Free Computational Spectral Authentication System
=============================================================
  Endpoints
  ─────────
  GET  /              → Service health and model metadata
  POST /predict       → Single tablet image authentication
  POST /predict-multi → Multi-shot tablet authentication (2-3 photos)

  Run:  python app.py
"""

import os
import sys
import json
import uuid
import datetime
import traceback
import pickle

import numpy as np
import cv2
from flask import Flask, request, jsonify
from flask_cors import CORS

from features import (
    extract_features_from_bytes,
    feature_dict,
    FEATURE_NAMES,
)
from quality import assess_image_quality, detect_human_face
from explanation import compute_explanation

# ── App setup ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
cors_origins = os.environ.get("CORS_ORIGINS", "*")
CORS(app, origins=cors_origins if cors_origins == "*" else [o.strip() for o in cors_origins.split(",")])

# Max upload limit (default 8 MB)
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", 8))
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "model")

# ── Load model artifacts & metadata ───────────────────────────────────────────
MODELS = {}
SCALERS = {}
MODEL_META = {}

def _load_artifacts():
    global MODELS, SCALERS, MODEL_META
    meta_path = os.path.join(MODEL_DIR, "model_meta.json")
    if os.path.exists(meta_path):
        with open(meta_path, "r", encoding="utf-8") as f:
            MODEL_META = json.load(f)

    for cond in ["flash_off", "flash_on", "pooled"]:
        m_path = os.path.join(MODEL_DIR, f"model_{cond}.pkl")
        s_path = os.path.join(MODEL_DIR, f"scaler_{cond}.pkl")

        # Fallback to root model.pkl / scaler.pkl if condition files not found
        if not os.path.exists(m_path):
            m_path = os.path.join(BASE_DIR, "model.pkl")
        if not os.path.exists(s_path):
            s_path = os.path.join(BASE_DIR, "scaler.pkl")

        if os.path.exists(m_path) and os.path.exists(s_path):
            with open(m_path, "rb") as f:
                MODELS[cond] = pickle.load(f)
            with open(s_path, "rb") as f:
                SCALERS[cond] = pickle.load(f)

    if not MODELS:
        print("[WARN] No model artifacts found! Please run training.py.")
    else:
        print(f"[OK] Loaded condition models: {list(MODELS.keys())}")
        if MODEL_META:
            saved_sklearn = MODEL_META.get("sklearn_version", "unknown")
            import sklearn
            if saved_sklearn != sklearn.__version__:
                print(f"[WARN] scikit-learn version mismatch! Saved with {saved_sklearn}, current is {sklearn.__version__}")
            else:
                print(f"[OK] Verified scikit-learn version matches artifact: {sklearn.__version__}")

_load_artifacts()


# ── Confidence calibration & decision scoring ─────────────────────────────────
def calibrate_score(decision_score: float, condition_meta: dict) -> tuple[str, int, float]:
    """
    Calibrates continuous decision_function score using stored genuine training percentiles:
    - Threshold T = p5 (default)
    - If score >= T: Genuine (confidence maps 0.50 -> 0.98)
    - If score < T: Fake (confidence maps 0.50 -> 0.99)
    - Margin around threshold: returns Inconclusive if score is in uncertainty band.

    Returns: (result: str, label_code: int, confidence: float)
    """
    thresh = float(condition_meta.get("decision_threshold", -0.05))
    pcts = condition_meta.get("score_percentiles", {})
    p1 = float(pcts.get("p1", thresh - 0.10))
    p50 = float(pcts.get("p50", thresh + 0.15))
    p95 = float(pcts.get("p95", thresh + 0.25))

    score = float(decision_score)
    margin = float(os.environ.get("DECISION_MARGIN", 0.015))

    # Uncertainty margin around the decision threshold
    if abs(score - thresh) < margin:
        return "Inconclusive", 0, 0.50

    if score >= thresh:
        # Genuine tablet
        result = "Genuine"
        label_code = 1
        if score <= p50:
            norm = (score - thresh) / (p50 - thresh + 1e-6)
            conf = 0.50 + 0.35 * norm
        else:
            norm = min(1.0, (score - p50) / (p95 - p50 + 1e-6))
            conf = 0.85 + 0.13 * norm
    else:
        # Outlier / Counterfeit tablet
        result = "Fake"
        label_code = -1
        if score >= p1:
            norm = (thresh - score) / (thresh - p1 + 1e-6)
            conf = 0.50 + 0.35 * norm
        else:
            norm = min(1.0, (p1 - score) / (abs(p1) + 1e-6))
            conf = 0.85 + 0.14 * norm

    conf = round(float(np.clip(conf, 0.01, 0.99)), 4)
    return result, label_code, conf


def get_condition_assets(shot_type: str = "unknown"):
    """Selects the best model, scaler, and metadata based on capture condition."""
    shot_norm = str(shot_type).lower().strip()
    if shot_norm in ["flash_on", "on"]:
        cond = "flash_on"
    elif shot_norm in ["flash_off", "off"]:
        cond = "flash_off"
    else:
        cond = "pooled"

    model = MODELS.get(cond) or MODELS.get("pooled")
    scaler = SCALERS.get(cond) or SCALERS.get("pooled")
    cond_meta = MODEL_META.get("conditions", {}).get(cond) or MODEL_META.get("conditions", {}).get("pooled", {})

    return cond, model, scaler, cond_meta


def decode_image_bytes(image_bytes: bytes) -> np.ndarray:
    """Safely decodes raw uploaded bytes to BGR numpy image."""
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Cannot decode image. Send a valid JPEG, PNG, or WEBP file.")
    return img


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/", methods=["GET"])
@app.route("/health", methods=["GET"])
def health():
    """Health check and model capability discovery."""
    return jsonify({
        "status": "online",
        "service": "Pharma Spectral Authentication API v2",
        "models_loaded": list(MODELS.keys()),
        "meta": {
            "model_type": MODEL_META.get("model_type", "IsolationForest"),
            "trained_at": MODEL_META.get("trained_at"),
            "python_version": MODEL_META.get("python_version"),
            "sklearn_version": MODEL_META.get("sklearn_version"),
            "conditions_available": list(MODEL_META.get("conditions", {}).keys()),
            "medicines_available": list(MODEL_META.get("medicine_stats", {}).keys()),
            "feature_names": FEATURE_NAMES,
        },
        "limits": {
            "max_upload_mb": MAX_UPLOAD_MB,
            "allowed_formats": ["image/jpeg", "image/png", "image/webp"]
        }
    })


@app.route("/predict", methods=["POST"])
def predict():
    """
    POST /predict — Single-shot tablet spectral authentication.
    Multipart form fields:
      - image (file)
      - medicine_name (optional string)
      - batch_id (optional string)
      - shot_type (optional: 'flash_on' | 'flash_off' | 'unknown')
      - angle (optional: 'top' | 'bottom')
    """
    if not MODELS:
        return jsonify({"error": "Model not loaded on server. Run training pipeline."}), 503

    if "image" not in request.files:
        return jsonify({"error": "No 'image' file field provided in multipart form."}), 400

    f = request.files["image"]
    if not f or f.filename == "":
        return jsonify({"error": "Empty or missing image filename."}), 400

    # Content type validation
    allowed_mimes = ["image/jpeg", "image/png", "image/webp", "image/jpg", "application/octet-stream"]
    if f.mimetype and f.mimetype.lower() not in allowed_mimes:
        return jsonify({"error": f"Unsupported MIME type '{f.mimetype}'. Use JPEG, PNG, or WEBP."}), 415

    medicine_name = request.form.get("medicine_name", "Unknown Medicine").strip()
    batch_id = request.form.get("batch_id", "").strip()
    shot_type = request.form.get("shot_type", "unknown").strip()
    angle = request.form.get("angle", "top").strip()

    try:
        image_bytes = f.read()
        if len(image_bytes) == 0:
            return jsonify({"error": "Uploaded image file is empty (0 bytes)."}), 400

        # Decode image
        img_bgr = decode_image_bytes(image_bytes)

        # Immediate rejection if a person's face is detected
        if detect_human_face(img_bgr):
            return jsonify({
                "error": "❌ A person's face was detected. Please upload or photograph a medicine tablet or capsule, not a person."
            }), 422

        # 1. Server-side Quality Gate
        quality = assess_image_quality(img_bgr)

        # 2. Select condition model
        cond_name, model, scaler, cond_meta = get_condition_assets(shot_type)

        # 3. Extract 17 spectral features
        from features import extract_features
        feat_vec = extract_features(img_bgr)

        # 4. Predict & Score
        x_scaled = scaler.transform(feat_vec.reshape(1, -1))
        dec_score = float(model.decision_function(x_scaled)[0])
        score_sample = float(model.score_samples(x_scaled)[0])

        # If quality check is severely failed, override verdict to Inconclusive
        if quality.get("is_severe", False):
            result = "Inconclusive"
            label_code = 0
            confidence = 0.50
            alert = f"Photo quality insufficient for reliable analysis: {', '.join(quality['issues'])}"
        else:
            result, label_code, confidence = calibrate_score(dec_score, cond_meta)
            if result == "Fake":
                alert = "⚠️ COUNTERFEIT DETECTED — This tablet deviates from the genuine spectral profile. Do NOT consume."
            elif result == "Inconclusive":
                alert = "⚠️ INCONCLUSIVE — Spectral reading is near the decision threshold. Please retake under steady lighting."
            else:
                alert = None

        # 5. Explainable AI payload
        med_stats = MODEL_META.get("medicine_stats", {}) if MODEL_META else {}
        explanation = compute_explanation(
            feat_vec,
            model,
            scaler,
            cond_meta,
            medicine_name=medicine_name,
            all_medicine_stats=med_stats
        )

        # 6. Response JSON
        scan_id = str(uuid.uuid4())[:8].upper()
        ts = datetime.datetime.utcnow().isoformat() + "Z"

        response_payload = {
            "scan_id": scan_id,
            "timestamp": ts,
            "medicine_name": medicine_name,
            "batch_id": batch_id,
            "result": result,
            "label_code": label_code,
            "confidence": confidence,
            "anomaly_score": round(score_sample, 4),
            "decision_score": round(dec_score, 4),
            "features": feature_dict(feat_vec),
            "explanation": explanation,
            "quality": {
                "ok": quality["ok"],
                "score": quality["score"],
                "issues": quality["issues"],
            },
            "model": {
                "version": "v2.0",
                "trained_at": MODEL_META.get("trained_at", "unknown"),
                "n_train": cond_meta.get("n_train", 0),
                "condition": cond_name,
            },
            "alert": alert,
        }

        return jsonify(response_payload)

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 422
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "Internal server error during prediction."}), 500


@app.route("/predict-multi", methods=["POST"])
def predict_multi():
    """
    POST /predict-multi — Multi-shot tablet authentication (2-3 photos).
    Multipart form fields:
      - images (multiple files: 'images')
      - shots_meta (JSON string array: [{'shot_type': 'flash_off', 'angle': 'top'}, ...])
      - medicine_name (optional string)
      - batch_id (optional string)
    """
    if not MODELS:
        return jsonify({"error": "Model not loaded on server. Run training pipeline."}), 503

    files = request.files.getlist("images")
    if not files or len(files) < 2:
        return jsonify({"error": "Please provide at least 2 images for multi-shot prediction."}), 400

    if len(files) > 4:
        files = files[:4]

    shots_meta_raw = request.form.get("shots_meta", "[]")
    try:
        shots_meta = json.loads(shots_meta_raw)
    except Exception:
        shots_meta = []

    medicine_name = request.form.get("medicine_name", "Unknown Medicine").strip()
    batch_id = request.form.get("batch_id", "").strip()

    from features import extract_features

    shots_results = []
    usable_shots = []

    for idx, f in enumerate(files):
        meta_item = shots_meta[idx] if idx < len(shots_meta) else {}
        shot_type = meta_item.get("shot_type", "unknown")
        angle = meta_item.get("angle", None)

        try:
            image_bytes = f.read()
            if len(image_bytes) == 0:
                continue
            img_bgr = decode_image_bytes(image_bytes)

            if detect_human_face(img_bgr):
                return jsonify({
                    "error": f"❌ A person's face was detected in photo #{idx+1}. Please photograph only the medicine tablet or capsule."
                }), 422

            # Quality check
            quality = assess_image_quality(img_bgr)
            cond_name, model, scaler, cond_meta = get_condition_assets(shot_type)

            # Features & scoring
            feat_vec = extract_features(img_bgr)
            x_scaled = scaler.transform(feat_vec.reshape(1, -1))
            dec_score = float(model.decision_function(x_scaled)[0])
            score_sample = float(model.score_samples(x_scaled)[0])

            shot_res, shot_label, shot_conf = calibrate_score(dec_score, cond_meta)
            explanation = compute_explanation(feat_vec, model, scaler, cond_meta)

            shot_data = {
                "index": idx,
                "shot_type": shot_type,
                "angle": angle,
                "result": shot_res,
                "label_code": shot_label,
                "decision_score": round(dec_score, 4),
                "anomaly_score": round(score_sample, 4),
                "confidence": shot_conf,
                "quality": {
                    "ok": quality["ok"],
                    "score": quality["score"],
                    "issues": quality["issues"],
                },
                "explanation": explanation,
                "feat_vec": feat_vec,
                "cond_meta": cond_meta,
                "model": model,
                "scaler": scaler,
            }
            shots_results.append(shot_data)

            # Usable if not severely degraded
            if not quality.get("is_severe", False):
                usable_shots.append(shot_data)

        except Exception as e:
            traceback.print_exc()
            continue

    if len(usable_shots) < 2:
        return jsonify({
            "scan_id": str(uuid.uuid4())[:8].upper(),
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            "medicine_name": medicine_name,
            "batch_id": batch_id,
            "result": "Inconclusive",
            "label_code": 0,
            "confidence": 0.50,
            "alert": "Fewer than 2 usable photos after quality filtering. Please retake photos with better focus and lighting.",
            "shots": [{k: v for k, v in s.items() if k not in ["feat_vec", "cond_meta", "model", "scaler"]} for s in shots_results],
            "agreement": 0.0,
            "combined_method": "quality gate drop (< 2 usable)",
        }), 200

    # ── Combine verdicts & scores ─────────────────────────────────────────────
    # Normalize per-shot scores to 0-1 scale (>0.5 Genuine, <0.5 Fake)
    calibrated_scores = []
    for s in usable_shots:
        if s["result"] == "Genuine":
            calibrated_scores.append(s["confidence"])
        elif s["result"] == "Fake":
            calibrated_scores.append(1.0 - s["confidence"])
        else:
            calibrated_scores.append(0.50)

    # Median for 3+ shots, mean for 2 shots
    if len(calibrated_scores) >= 3:
        combined_score = float(np.median(calibrated_scores))
        combined_method = "median of calibrated per-shot scores"
    else:
        combined_score = float(np.mean(calibrated_scores))
        combined_method = "mean of calibrated per-shot scores"

    # Measure agreement
    verdicts = [s["result"] for s in usable_shots]
    genuine_count = verdicts.count("Genuine")
    fake_count = verdicts.count("Fake")
    total_usable = len(usable_shots)
    majority_count = max(genuine_count, fake_count)
    agreement = round(float(majority_count / total_usable), 2)

    # Check for severe disagreement (e.g. 1 confident Genuine, 1 confident Fake)
    if genuine_count > 0 and fake_count > 0 and abs(genuine_count - fake_count) <= 1 and agreement <= 0.67:
        combined_verdict = "Inconclusive"
        combined_label = 0
        final_conf = 0.50
        alert = "⚠️ Disagreement between photos — lighting or angle may be inconsistent. Retake in steady light."
    elif combined_score >= 0.50:
        combined_verdict = "Genuine"
        combined_label = 1
        final_conf = round(combined_score, 4)
        alert = None
    else:
        combined_verdict = "Fake"
        combined_label = -1
        final_conf = round(1.0 - combined_score, 4)
        alert = "⚠️ COUNTERFEIT DETECTED — Multi-shot analysis confirms deviation from genuine profile."

    # Average feature vector for combined explanation
    avg_feat_vec = np.mean([s["feat_vec"] for s in usable_shots], axis=0)
    primary_shot = usable_shots[0]
    med_stats = MODEL_META.get("medicine_stats", {}) if MODEL_META else {}
    combined_explanation = compute_explanation(
        avg_feat_vec,
        primary_shot["model"],
        primary_shot["scaler"],
        primary_shot["cond_meta"],
        medicine_name=medicine_name,
        all_medicine_stats=med_stats
    )

    clean_shots = [
        {k: v for k, v in s.items() if k not in ["feat_vec", "cond_meta", "model", "scaler"]}
        for s in shots_results
    ]

    scan_id = str(uuid.uuid4())[:8].upper()
    ts = datetime.datetime.utcnow().isoformat() + "Z"

    return jsonify({
        "scan_id": scan_id,
        "timestamp": ts,
        "medicine_name": medicine_name,
        "batch_id": batch_id,
        "result": combined_verdict,
        "label_code": combined_label,
        "confidence": final_conf,
        "decision_score": round(float(np.mean([s["decision_score"] for s in usable_shots])), 4),
        "anomaly_score": round(float(np.mean([s["anomaly_score"] for s in usable_shots])), 4),
        "features": feature_dict(avg_feat_vec),
        "explanation": combined_explanation,
        "quality": {
            "ok": all(s["quality"]["ok"] for s in usable_shots),
            "score": round(float(np.mean([s["quality"]["score"] for s in usable_shots])), 3),
            "issues": [issue for s in usable_shots for issue in s["quality"]["issues"]],
        },
        "model": {
            "version": "v2.0",
            "trained_at": MODEL_META.get("trained_at", "unknown"),
            "n_train": len(usable_shots),
            "condition": "multi_condition",
        },
        "shots": clean_shots,
        "agreement": agreement,
        "combined_method": combined_method,
        "alert": alert,
    })


# ── Run ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    debug_mode = os.environ.get("FLASK_DEBUG", "0").lower() in ("1", "true", "yes")
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=debug_mode)