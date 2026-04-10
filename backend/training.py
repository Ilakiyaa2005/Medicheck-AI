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

import os, warnings
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

# ── CONFIG ────────────────────────────────────────────────────────────────────
CSV_PATH        = "dataset.csv"   # ← change to your CSV filename
MODEL_OUT       = "model.pkl"
SCALER_OUT      = "scaler.pkl"

# Isolation Forest hyper-parameters
CONTAMINATION   = 0.05   # expected fraction of outliers in training data
                          # (set to 0.0 if your CSV is truly 100% genuine)
N_ESTIMATORS    = 200
RANDOM_STATE    = 42

# ── STEP 1 — LOAD ─────────────────────────────────────────────────────────────
print("=" * 60)
print("  STEP 1: Loading Dataset")
print("=" * 60)

if not os.path.exists(CSV_PATH):
    print(f"  [INFO] '{CSV_PATH}' not found → generating synthetic genuine data.")
    np.random.seed(RANDOM_STATE)
    n = 400
    data = {
        "Mean_R":       np.random.normal(205, 8,  n),
        "Mean_G":       np.random.normal(178, 8,  n),
        "Mean_B":       np.random.normal(142, 8,  n),
        "R_G_Ratio":    np.random.normal(1.15, 0.05, n),
        "G_B_Ratio":    np.random.normal(1.25, 0.05, n),
        "R_B_Ratio":    np.random.normal(1.44, 0.06, n),
        "Mean_H":       np.random.normal(22,  4,  n),
        "Mean_S":       np.random.normal(55,  6,  n),
        "Mean_V":       np.random.normal(200, 8,  n),
        "Contrast":     np.random.normal(120, 20, n),
        "Homogeneity":  np.random.normal(0.45, 0.05, n),
        "Mean_Intensity": np.random.normal(188, 8, n),
        "Max_Intensity":  np.random.normal(240, 5, n),
        "Min_Intensity":  np.random.normal(110, 8, n),
        "Std_Intensity":  np.random.normal(30,  4, n),
        "Glossiness":     np.random.normal(15,  3, n),
        "Specular_Ratio": np.random.normal(0.08, 0.02, n),
    }
    df = pd.DataFrame(data)
    df = pd.read_excel(CSV_PATH)
    print(f"  [OK] Loaded '{CSV_PATH}' — {len(df)} rows, {len(df.columns)} columns")
else:
    df = pd.read_excel(CSV_PATH)
    print(f"  [OK] Loaded '{CSV_PATH}' — {len(df)} rows, {len(df.columns)} columns")

# ── STEP 2 — PREPROCESS ───────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("  STEP 2: Preprocessing")
print("=" * 60)

# Select only the features present in both CSV and FEATURE_NAMES
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
X.fillna(X.median(numeric_only=True), inplace=True)
print(f"  [OK] Filled {nan_count} NaN values with column medians.")
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

print("\n  ✅  Training complete!")
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

demo_predict(X_scaled[0],  "Train sample 0  (expect Genuine)")
demo_predict(X_scaled[-1], "Train sample -1 (expect Genuine)")

# Simulate a fake by perturbing a genuine sample heavily
fake_raw = X_scaled[0].copy()
fake_raw += np.random.normal(loc=5, scale=2, size=fake_raw.shape)
demo_predict(fake_raw, "Perturbed sample (expect Fake)")