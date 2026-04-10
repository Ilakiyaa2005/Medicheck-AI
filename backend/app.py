"""
=============================================================
  app.py  —  Flask REST API
  Hardware-Free Computational Spectral Authentication System
=============================================================
  Endpoints
  ─────────
  GET  /              → health check
  POST /predict       → analyse tablet image
  GET  /history       → scan history (last N)
  DELETE /history/<id> → delete one record

  Run:  python app.py
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import pickle, os, uuid, datetime, traceback

from features import (
    extract_features_from_bytes,
    feature_dict,
    FEATURE_NAMES,
)

# ── App setup ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, origins="*")

BASE = os.path.dirname(os.path.abspath(__file__))

# ── Load artifacts ─────────────────────────────────────────────────────────────
def _load(name):
    p = os.path.join(BASE, name)
    if not os.path.exists(p):
        return None
    with open(p, "rb") as f:
        return pickle.load(f)

iso_model = _load("model.pkl")
scaler    = _load("scaler.pkl")

if iso_model is None or scaler is None:
    print("[WARN] model.pkl / scaler.pkl not found. Run training.py first.")
else:
    print("[OK]  Model and scaler loaded.")

# Pre-compute training score statistics (for normalisation)
# These are stored inside the IsolationForest estimator via offset_
# We'll calibrate confidence using the decision function directly.
SCORE_CACHE = {}   # will be populated lazily

# ── In-memory scan history (MongoDB-optional) ─────────────────────────────────
try:
    from pymongo import MongoClient
    _client = MongoClient(os.environ.get("MONGO_URI","mongodb://localhost:27017/"), serverSelectionTimeoutMS=1500)
    _client.server_info()
    _col = _client["pharma_auth"]["anomaly_scans"]
    print("[OK]  MongoDB connected.")
except Exception:
    _col = None
    print("[INFO] MongoDB unavailable → using in-memory store.")

_mem_history = []


def _save_scan(doc):
    if _col is not None:
        _col.insert_one({**doc, "_id": doc["scan_id"]})
    else:
        _mem_history.insert(0, doc)
        if len(_mem_history) > 200:
            _mem_history.pop()


def _get_history(limit=20):
    if _col is not None:
        return list(_col.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit))
    return _mem_history[:limit]


def _delete_scan(scan_id):
    if _col is not None:
        _col.delete_one({"scan_id": scan_id})
    else:
        global _mem_history
        _mem_history = [s for s in _mem_history if s["scan_id"] != scan_id]


# ── Prediction helper ─────────────────────────────────────────────────────────
def predict_from_vector(vec: np.ndarray) -> dict:
    """
    Takes a raw (un-scaled) feature vector (shape 17,),
    scales it, runs Isolation Forest, returns result dict.

    Confidence mapping
    ──────────────────
    iso.decision_function(x)  →  > 0 = inlier (genuine), < 0 = outlier (fake)
    We map this to 0–1 using a calibrated sigmoid so the UI can show %.
    """
    x_scaled = scaler.transform(vec.reshape(1, -1))

    # Raw prediction: +1 = genuine, -1 = fake
    pred  = int(iso_model.predict(x_scaled)[0])

    # Decision function: positive = more genuine, negative = more anomalous
    dec_score   = float(iso_model.decision_function(x_scaled)[0])
    score_sample = float(iso_model.score_samples(x_scaled)[0])

    # Sigmoid-style mapping to confidence [0,1]
    # decision_function is already centred at 0; scale by a factor
    confidence_genuine = float(1.0 / (1.0 + np.exp(-dec_score * 10)))

    result = "Genuine" if pred == 1 else "Fake"

    # If fake, confidence refers to "how fake" it is
    confidence = confidence_genuine if pred == 1 else (1.0 - confidence_genuine)
    confidence = round(min(max(confidence, 0.01), 0.99), 4)

    return {
        "result":        result,
        "label_code":    pred,       # +1 genuine  /  -1 fake  (for dev reference)
        "confidence":    confidence,
        "anomaly_score": round(score_sample, 4),
        "decision_score":round(dec_score, 4),
    }


# ── Routes ────────────────────────────────────────────────────────────────────
@app.route("/", methods=["GET"])
def health():
    return jsonify({
        "status":       "online",
        "service":      "Pharma Spectral Authentication API",
        "model_loaded": iso_model is not None,
        "method":       "Isolation Forest (anomaly detection)",
        "features":     FEATURE_NAMES,
    })


@app.route("/predict", methods=["POST"])
def predict():
    if iso_model is None or scaler is None:
        return jsonify({"error": "Model not loaded. Run training.py first."}), 503

    if "image" not in request.files:
        return jsonify({"error": "No 'image' field. Send multipart/form-data with field 'image'."}), 400

    f = request.files["image"]
    if f.filename == "":
        return jsonify({"error": "Empty filename."}), 400

    medicine_name = request.form.get("medicine_name", "Unknown Medicine").strip()
    batch_id      = request.form.get("batch_id", "").strip()

    try:
        image_bytes = f.read()

        # ── Feature extraction ─────────────────────────────────────────────
        feature_vec = extract_features_from_bytes(image_bytes)

        # ── Prediction ────────────────────────────────────────────────────
        pred_info = predict_from_vector(feature_vec)

        # ── Build response ────────────────────────────────────────────────
        scan_id = str(uuid.uuid4())[:8].upper()
        ts      = datetime.datetime.utcnow().isoformat() + "Z"

        doc = {
            "scan_id":       scan_id,
            "medicine_name": medicine_name,
            "batch_id":      batch_id,
            "timestamp":     ts,
            **pred_info,
            "features":      feature_dict(feature_vec),
            "alert": (
                "⚠️ COUNTERFEIT DETECTED — This tablet deviates from the genuine spectral profile. Do NOT consume."
                if pred_info["result"] == "Fake" else None
            ),
        }

        _save_scan({k: v for k, v in doc.items()})   # persist

        return jsonify(doc)

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 422
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Internal server error during prediction."}), 500


@app.route("/history", methods=["GET"])
def history():
    limit = min(int(request.args.get("limit", 30)), 200)
    try:
        return jsonify({"scans": _get_history(limit), "count": len(_get_history(limit))})
    except Exception:
        return jsonify({"scans": [], "count": 0})


@app.route("/history/<scan_id>", methods=["DELETE"])
def delete_one(scan_id):
    try:
        _delete_scan(scan_id)
        return jsonify({"message": f"Scan {scan_id} deleted."})
    except Exception:
        return jsonify({"error": "Delete failed."}), 500


# ── Run ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)