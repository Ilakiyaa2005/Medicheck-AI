# MediCheck-AI (SpectraAuth) 🔬🛡️

> **Hardware-Free Computational Optical Screening & Anomaly Detection for Pharmaceuticals**  
> *A privacy-preserving, explainable machine learning system for detecting counterfeit medicines and verifying blister pack integrity.*

---

## 🌟 Key Highlights

- **🔒 100% On-Device Privacy (Zero-Database)**: Zero logins, zero accounts, and zero cloud database. All scan history, images, and notes are stored strictly in the user's browser `localStorage`.
- **🧠 Condition-Specific Anomaly Detection**: Unsupervised **Isolation Forest** models trained on verified genuine pharmaceutical spectra, with dedicated models for `Flash OFF` and `Flash ON` conditions.
- **📊 Explainable AI (XAI)**: Diverging $z$-score deviation charts with normal baseline bands ($\pm 1.96\sigma$) and plain-English diagnostic explanations for every prediction.
- **📷 Real-Time Camera Quality Gate**: Live in-browser computer vision measuring brightness, focus blur (Laplacian variance), specular glare, inter-frame motion, and framing before image capture.
- **📦 Packaging OCR & GS1 QR Verification**: Automatic extraction of Indian blister pack batch numbers (`B.No.`, `Batch:`), GS1 Datamatrix barcodes, and pharmaceutical end-of-month expiry calculation.
- **📸 Multi-Shot Consensus Mode**: Guided 2–3 photo protocol (Flash OFF, Flash ON, angled/flipped) with multi-model consensus scoring.

---

## 📐 Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT BROWSER (React 18 + Vite)                │
├────────────────────────────────────────────────────────────────────────┤
│ • Real-time Viewfinder CV: Brightness, Blur, Glare, Motion, Fill Ratio │
│ • Packaging OCR: Tesseract.js (Web Worker) + Native/ZXing Barcode      │
│ • Local Storage: Max 100 scans, Quota Fallback, JSON Export/Import     │
│ • UI: Dark Neon Aesthetic, Accessible Diagnostics, Multi-Shot Stepper  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP POST (multipart/form-data)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       BACKEND API (Stateless Flask)                    │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Quality Gate (quality.py):                                          │
│    - Brightness [60, 215], Blur (Laplacian var), Glare (<4%)           │
│ 2. Feature Extractor (features.py):                                    │
│    - 17 optical metrics: RGB, HSV (normalized [0,1]), GLCM, Glossiness │
│ 3. Model Engine (app.py):                                              │
│    - Dynamic router: 'flash_off' -> model_flash_off.pkl                │
│                      'flash_on'  -> model_flash_on.pkl                 │
│ 4. Calibrated Confidence & Explainable AI (explanation.py):            │
│    - Score percentiles (p5, p50, p95), Z-scores, feature ablation      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🔬 Machine Learning Pipeline

### Why Unsupervised Anomaly Detection?
Real-world counterfeit surveillance datasets typically lack labelled, verified counterfeit samples across all drug formulations. Training a supervised binary classifier on synthetic counterfeits causes high false-positive rates on unseen genuine production batches.

MediCheck-AI is trained exclusively on **genuine pharmaceutical tablets** across 22 medicines and 12 distinct manufacturing batches. Anomaly detection identifies any tablet whose optical, spectral, or surface texture characteristics deviate significantly from genuine manufacturing tolerances.

### Model Benchmarks
Leave-One-Group-Out Cross-Validation (grouped by batch & medicine) was evaluated across 4 anomaly detection candidates:

| Candidate Algorithm | Unseen Batch Genuine Retention | Synthetic Perturbation Rejection | Selected |
| :--- | :---: | :---: | :---: |
| **Isolation Forest** | **93.9%** | **96.5%** | **Yes (Primary)** |
| **One-Class SVM (RBF)** | 91.2% | 94.1% | Candidate |
| **Elliptic Envelope** | 88.4% | 92.0% | Candidate |
| **Local Outlier Factor (LOF)** | 85.1% | 89.8% | Candidate |

### Calibrated Decision Thresholds & Confidence
Rather than applying an arbitrary sigmoid to the raw decision score, confidence is calibrated against empirical training percentiles:
- **Decision Threshold**: $p_5$ of genuine validation scores. Samples with score $\ge p_5$ are classified as **Genuine**; scores below are **Anomalous**.
- **Confidence Formula**:
  - For Genuine: $\text{score} \ge p_{50} \implies 80\% + 19\% \times \frac{\text{score} - p_{50}}{p_{95} - p_{50}}$; $\text{score} \in [p_5, p_{50}] \implies 60\% + 20\% \times \frac{\text{score} - p_5}{p_{50} - p_5}$.
  - For Anomalous: $60\% + 38\% \times \min\left(1.0, \frac{| \text{score} - p_5 |}{| p_5 - p_1 |}\right)$.
  - Scores close to $p_5$ ($\pm 0.02$) with borderline quality are flagged as **Inconclusive**.

---

## 🚀 Getting Started

### Prerequisites
- **Python**: 3.10 or 3.11
- **Node.js**: 18+ (tested on Node 20 / 22)
- **Git**

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# Linux / macOS:
source venv/bin/activate

# Install runtime dependencies
pip install -r requirements.txt

# (Optional) Install training and testing dependencies
pip install -r requirements-train.txt

# Run the backend server (starts on http://localhost:5000)
python app.py
```

### 2. Frontend Setup

```bash
cd web-app

# Install dependencies
npm install

# Start Vite development server (starts on http://localhost:3000)
npm run dev
```

### 3. Environment Variables

Create `.env` inside `web-app/` to override the backend API URL if needed:

```env
VITE_API_URL=http://localhost:5000
```

---

## 🔄 Retraining & Benchmark Pipeline

To retrain the models on a new dataset or re-run the 4-algorithm benchmark:

```bash
cd backend
python training.py --csv updated_pharma_dataset.csv
```

This pipeline will:
1. Audit the dataset for missing values and duplicates.
2. Run Leave-One-Group-Out CV and multi-feature synthetic stress tests across all 4 candidate models.
3. Train and export:
   - `model/model_flash_off.pkl` & `model/scaler_flash_off.pkl`
   - `model/model_flash_on.pkl` & `model/scaler_flash_on.pkl`
   - `model/model_pooled.pkl` & `model/scaler_pooled.pkl`
4. Compute and export calibrated metadata, thresholds, and per-feature distributions to `model/model_meta.json`.
5. Save diagnostic score distribution plots to `reports/score_distribution_*.png`.

---

## 📡 API Reference

### `GET /health`
Returns system health, model availability, and loaded condition models.

**Response:**
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "models_loaded": {
    "flash_off": true,
    "flash_on": true,
    "pooled": true
  }
}
```

---

### `POST /predict`
Authenticates a single tablet photo.

**Headers:**
- `Content-Type: multipart/form-data`

**Parameters:**
- `image`: File (JPEG, PNG, WEBP, max 8 MB)
- `shot_type`: String (`flash_off` | `flash_on` | `pooled`)
- `medicine_name`: (Optional) String

**Response (v2 Contract):**
```json
{
  "prediction": "Genuine",
  "confidence": 0.88,
  "confidence_percentage": 88.0,
  "anomaly_score": 0.0452,
  "quality": {
    "ok": true,
    "metrics": {
      "brightness": 142.1,
      "blur_score": 115.4,
      "glare_fraction": 0.005,
      "fill_ratio": 0.38
    },
    "warnings": []
  },
  "explanation": {
    "summary": "Sample closely matches genuine spectral and optical baseline.",
    "top_reasons": [
      "Color saturation and luminance are within genuine manufacturing tolerance.",
      "Surface glossiness matches genuine tablet coating."
    ],
    "feature_deviations": [
      {
        "feature": "Mean_R",
        "label": "Red Channel Luminance",
        "value": 182.4,
        "genuine_mean": 180.1,
        "z_score": 0.23,
        "status": "normal"
      }
    ]
  },
  "model": {
    "model_condition": "flash_off",
    "threshold": -0.0152
  }
}
```

---

### `POST /predict-multi`
Authenticates a series of 2–3 photos taken under complementary lighting angles.

**Parameters:**
- `shots`: Multiple files (`shots[0]`, `shots[1]`, `shots[2]`)
- `shots_meta`: JSON string containing metadata array: `[{"shot_type": "flash_off"}, {"shot_type": "flash_on"}, {"shot_type": "flash_off"}]`

**Response:**
```json
{
  "consensus_prediction": "Genuine",
  "consensus_confidence": 0.86,
  "agreement": 1.0,
  "disagreement_warning": null,
  "shots_evaluated": 2,
  "per_shot_results": [ ... ]
}
```

---

## ⚙️ Configuration & Quality Tuning

Quality parameters are aligned across `backend/quality.py` and `web-app/src/lib/qualityConfig.js`:

```javascript
export const QUALITY_CONFIG = {
  brightnessMin: 60,      // Minimum acceptable mean luminance [0-255]
  brightnessMax: 215,     // Maximum acceptable luminance before overexposure
  blurThreshold: 45.0,    // Minimum discrete Laplacian variance for sharp focus
  glareMaxFraction: 0.04, // Max allowed fraction of saturated glare pixels (>250)
  motionThreshold: 8.0,   // Max inter-frame difference for camera stability
  fillMinRatio: 0.12,     // Min guide box foreground fill ratio
  fillMaxRatio: 0.85,     // Max fill ratio before edge clipping occurs
};
```

---

## 🧪 Testing & Verification

### Backend Tests (pytest)
Runs 17 comprehensive unit and integration tests including train/serve feature parity, quality checks, XAI logic, `/predict`, and `/predict-multi`:

```bash
cd backend
pytest tests/ -v
```

### Frontend Tests (Vitest)
Runs 29 browser-agnostic unit tests covering quality CV metrics, end-of-month expiry logic, Indian label OCR regexes, GS1 QR parsing, keyword guards, and local storage:

```bash
cd web-app
npm test
```

### Production Build
Verifies clean compilation and bundle chunking:

```bash
cd web-app
npm run build
```

---

## ⚠️ Limitations & Scientific Disclaimers

1. **Screening Tool, Not a Chemical Assay**: MediCheck-AI is a computational optical screening tool designed for rapid first-line field triage. It measures macroscopic color, surface gloss, and visual texture. It cannot determine exact chemical molecular purity or active pharmaceutical ingredient (API) concentration like High-Performance Liquid Chromatography (HPLC) or Mass Spectrometry.
2. **Camera Sensor Variations**: Smartphone cameras have different ISP tone-mapping curves, white balance adjustments, and sensor resolutions. While CLAHE normalization and condition models mitigate lighting variance, extreme lighting conditions or uncalibrated camera post-processing may cause false positives.
3. **Formulation-Specific Tolerances**: Optical properties vary between medicine brands (e.g., white uncoated paracetamol vs blue film-coated tablets). Unsupervised models detect outliers relative to their training distribution; when screening unindexed formulations, multi-shot mode and packaging verification should always be used.
4. **Packaging Integrity First**: If packaging tamper-evident seals are broken or label batch codes fail GS1 verification, do not consume the medicine regardless of optical scan results.

---

## 📄 License
This project is licensed under the MIT License.
