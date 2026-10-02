"""
=============================================================
  training.py  —  Isolation Forest Anomaly Detection
  Hardware-Free Computational Spectral Authentication System
=============================================================
  HOW IT WORKS
  ─────────────
  • Loads CSV containing ONLY genuine tablet data
  • Trains Isolation Forest on genuine patterns ONLY
  • At prediction time:
      +1  →  Genuine  (within normal distribution)
      -1  →  Fake     (anomaly / deviation detected)
  • Anomaly score converted to confidence %

  RUN:  python training.py
  OUT:  model.pkl, scaler.pkl
"""

import os, sys, warnings
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
import numpy as np
import pandas as pd
import pickle
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
import matplotlib
matplotlib.use("Agg")          # non-interactive backend
import matplotlib.pyplot as plt

warnings.filterwarnings("ignore")

from features import FEATURE_NAMES    # canonical column order

import argparse

# ── CONFIG ────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Train Isolation Forest anomaly detector on genuine tablet spectral features.")
parser.add_argument("--csv", type=str, default="updated_pharma_dataset.csv", help="Path to input dataset CSV")
parser.add_argument("--images-dir", type=str, default=None, help="Optional path to directory of raw images")
args = parser.parse_args()

CSV_PATH   = args.csv
MODEL_OUT  = "model.pkl"
SCALER_OUT = "scaler.pkl"

# Isolation Forest hyper-parameters
CONTAMINATION = 0.05   # initial baseline
N_ESTIMATORS  = 200
RANDOM_STATE  = 42

# ── STEP 1 — LOAD ─────────────────────────────────────────────────────────────
print("=" * 60)
print(f"  STEP 1: Loading Dataset from '{CSV_PATH}'")
print("=" * 60)

if not os.path.exists(CSV_PATH):
    # Try looking relative to script directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    alt_path = os.path.join(script_dir, CSV_PATH)
    if os.path.exists(alt_path):
        CSV_PATH = alt_path
    else:
        raise FileNotFoundError(f"Dataset CSV not found at '{CSV_PATH}'. Please verify the path.")

df = pd.read_csv(CSV_PATH, encoding="utf-8-sig", engine="python", on_bad_lines="skip")
print(f"  [OK] Loaded '{CSV_PATH}' — {len(df)} rows, {len(df.columns)} columns")

# Clean dirty string values in categorical columns
for col in ["Medicine_Name", "Batch_Number", "Brand", "Phone_Model", "Light_Type", "Flash", "Angle"]:
    if col in df.columns:
        df[col] = df[col].astype(str).str.strip()

if "Flash" in df.columns:
    df["Flash"] = df["Flash"].str.upper()
if "Angle" in df.columns:
    df["Angle"] = df["Angle"].str.upper()

# ── STEP 2 — PREPROCESS ───────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("  STEP 2: Preprocessing")
print("=" * 60)

# Check for duplicate feature rows
dup_count = df.duplicated(subset=FEATURE_NAMES).sum()
if dup_count > 0:
    print(f"  [WARN] Found {dup_count} duplicate feature rows. Dropping duplicates.")
    df = df.drop_duplicates(subset=FEATURE_NAMES).reset_index(drop=True)
    print(f"  [OK] Retained {len(df)} unique rows.")

available = [f for f in FEATURE_NAMES if f in df.columns]
missing   = [f for f in FEATURE_NAMES if f not in df.columns]
if missing:
    print(f"  [WARN] These features are missing from CSV: {missing}")
    print(f"         They will be filled with 0 during training.")
    for col in missing:
        df[col] = 0.0

X = df[FEATURE_NAMES].copy()

# Fill NaN with column median
nan_count = X.isnull().sum().sum()
if nan_count > 0:
    X.fillna(X.median(numeric_only=True), inplace=True)
    print(f"  [OK] Filled {nan_count} NaN values with column medians.")
else:
    print("  [OK] No NaN values found in feature columns.")
print(f"  [OK] Feature matrix shape: {X.shape}")

# ── STEP 3 — SCALE ────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("  STEP 3: Normalisation")
print("=" * 60)

scaler   = StandardScaler()
X_scaled = scaler.fit_transform(X)
print("  [OK] StandardScaler fitted (zero mean, unit variance).")

# ── STEP 4 — TRAIN ────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("  STEP 4: Training Isolation Forest")
print("=" * 60)
print(f"  n_estimators  : {N_ESTIMATORS}")
print(f"  contamination : {CONTAMINATION}")

iso = IsolationForest(
    n_estimators=N_ESTIMATORS,
    contamination=CONTAMINATION,
    random_state=RANDOM_STATE,
    n_jobs=-1
)
iso.fit(X_scaled)
print("  [OK] Isolation Forest trained on genuine data only.")

# ── STEP 5 — SELF-EVALUATION ──────────────────────────────────────────────────
print("\n" + "=" * 60)
print("  STEP 5: Self-Evaluation on Training Data")
print("=" * 60)

preds  = iso.predict(X_scaled)
scores = iso.score_samples(X_scaled)   # raw anomaly scores (more negative = more anomalous)

genuine_pct = float((preds == 1).sum()) / len(preds) * 100
print(f"  Genuine classified as Genuine : {genuine_pct:.1f}%")
print(f"  Score range : [{scores.min():.3f}, {scores.max():.3f}]")

# ── STEP 6 — SAVE ─────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("  STEP 6: Saving Artifacts")
print("=" * 60)

with open(MODEL_OUT,  "wb") as f: pickle.dump(iso,    f)
with open(SCALER_OUT, "wb") as f: pickle.dump(scaler, f)
print(f"  [OK] {MODEL_OUT}  saved")
print(f"  [OK] {SCALER_OUT} saved")

# ── STEP 7 — SCORE DISTRIBUTION PLOT ─────────────────────────────────────────
try:
    fig, ax = plt.subplots(figsize=(8, 3))
    ax.hist(scores, bins=40, color="#4d9fff", edgecolor="#080c14", alpha=0.85)
    threshold = np.percentile(scores, CONTAMINATION * 100)
    ax.axvline(threshold, color="#ff3d6b", linewidth=2, linestyle="--", label=f"Decision threshold ({threshold:.3f})")
    ax.set_xlabel("Anomaly Score"); ax.set_ylabel("Count")
    ax.set_title("Isolation Forest — Score Distribution (Genuine Training Data)")
    ax.legend(); ax.set_facecolor("#0d1424"); fig.patch.set_facecolor("#080c14")
    ax.tick_params(colors="white"); ax.xaxis.label.set_color("white"); ax.yaxis.label.set_color("white"); ax.title.set_color("white")
    for spine in ax.spines.values(): spine.set_edgecolor("#333")
    plt.tight_layout()
    plt.savefig("score_distribution.png", dpi=120, bbox_inches="tight")
    print("  [OK] score_distribution.png saved")
except Exception as e:
    print(f"  [INFO] Could not save plot: {e}")

print("\n  [OK] Training complete!")
print("      Run:  python app.py   to start the API")
print("=" * 60)

# ── QUICK PREDICTION DEMO ─────────────────────────────────────────────────────
print("\n  Quick sanity check:")

def demo_predict(x_raw, label="?"):
    x_s   = scaler.transform(x_raw.reshape(1, -1))
    pred  = iso.predict(x_s)[0]
    score = float(iso.score_samples(x_s)[0])
    # Map score to 0–1 confidence using sigmoid-like normalisation
    score_min, score_max = scores.min(), scores.max()
    norm  = (score - score_min) / (score_max - score_min + 1e-9)
    conf  = round(float(norm), 4)
    result = "Genuine" if pred == 1 else "Fake"
    print(f"    [{label}]  pred={pred}  score={score:.3f}  confidence={conf:.2%}  → {result}")

demo_predict(X.iloc[0].values,  "Train sample 0  (expect Genuine)")
demo_predict(X.iloc[-1].values, "Train sample -1 (expect Genuine)")

# Simulate a fake by heavily perturbing a genuine sample in raw feature space
fake_raw = X.iloc[0].values.copy()
fake_raw[0] = fake_raw[0] * 0.1   # alter color drastically
fake_raw[6] = (fake_raw[6] + 90.0) % 180.0  # alter hue
demo_predict(fake_raw, "Perturbed sample (expect Fake)")