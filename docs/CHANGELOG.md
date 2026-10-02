# Changelog — MediCheck-AI (SpectraAuth)

All notable changes across development phases on branch `upgrade/v2`.

---

## [Phase 1] — Verified Problem Fixes & Parity Enforcement
*Date: 2026-10-02*

### What Changed
1. **HSV Scale Alignment (`backend/features.py`)**:
   - Fixed train/serve skew where `Mean_S` and `Mean_V` were extracted on `0–255` uint8 range while training datasets expect `[0, 1]`.
   - Divided `Mean_S` and `Mean_V` by 255.0 to align extraction with the canonical dataset scale.
   - Retained 0–255 `crop_hsv` for `Glossiness` and `Specular_Ratio` to preserve calibration consistency with dataset values.
2. **`training.py` Bug Fixes**:
   - Added CLI argument parsing (`--csv` and `--images-dir`).
   - Fixed hardcoded `"pharma_dataset.csv"` path; now reads from path provided via `--csv`.
   - Removed dead synthetic data branch.
   - Added `utf-8-sig` encoding and categorical string sanitization (stripping whitespace, uppercase normalization).
   - Added automated detection and removal of duplicate feature rows (3 duplicate rows pruned).
   - Fixed double-scaling bug in `demo_predict` (passes unscaled raw feature vectors to `scaler.transform()`).
   - Fixed Windows console Unicode printing.
3. **Frontend Keyword Guard Fix (`web-app/src/App.jsx`)**:
   - Replaced substring matching in `validateMedicineImage` with whole-word token matching.
   - Genuine medicines with substrings like "car" (Carvedilol, Carbamazepine, Calcium carbonate, Levocarnitine) are now accepted, while non-medicine inputs ("car", "tea", "cat") remain guarded.
4. **Environment-Configurable Endpoints & Servers**:
   - `web-app/src/api.js`: Reads `import.meta.env.VITE_API_URL` with fallback to Render deployment.
   - `backend/app.py`: Made CORS origins and Flask debug mode configurable via `CORS_ORIGINS` and `FLASK_DEBUG`.
5. **Feature Parity Test Suite (`backend/tests/test_feature_parity.py`)**:
   - Automated pytest assertions ensuring extracted features on realistic tablet samples match the training dataset distribution bounds within ±5σ.
   - Specifically enforces `Mean_S` and `Mean_V` in `[0, 1]` and `Mean_H` in `[0, 180]`.

### How to Verify
- Run parity test: `pytest backend/tests/test_feature_parity.py -v` (passes 100%).
- Run training CLI: `python backend/training.py --csv backend/updated_pharma_dataset.csv` (runs without error).
- Test medicine names: verified Carvedilol, Carbamazepine, Calcium carbonate, and Levocarnitine pass validation.

---

## [Phase 2] — Dataset Audit, Retraining & Model Artifacts
*Date: 2026-10-02*

### What Changed
1. **Dataset Audit (`backend/reports/data_audit.md`)**:
   - Audited `updated_pharma_dataset.csv` (215 rows, 27 columns).
   - Confirmed genuine-only samples across 22 medicines and 12 batches, with zero fake samples (unsupervised anomaly detection required).
   - Confirmed Option B (no raw images in repository).
   - Verified Flash condition split: 104 Flash OFF, 108 Flash ON (both $\ge 60$ threshold, enabling per-condition models).
2. **Model Benchmarking (`backend/training.py`)**:
   - Benchmarked 4 anomaly detector candidates using Leave-One-Group-Out CV grouped by batch/medicine and synthetic multi-feature counterfeit perturbation stress tests.
   - Selected Isolation Forest as core detector: 93.9% genuine acceptance on unseen batches, robust outlier rejection, combined with feature ablation impact for explainability.
3. **Condition-Specific Models**:
   - Trained `flash_off` model & scaler (`backend/model/model_flash_off.pkl`, `scaler_flash_off.pkl`).
   - Trained `flash_on` model & scaler (`backend/model/model_flash_on.pkl`, `scaler_flash_on.pkl`).
   - Trained `pooled` fallback model & scaler (`backend/model/model_pooled.pkl`, `scaler_pooled.pkl`).
4. **Artifacts & Comprehensive Metadata (`backend/model/model_meta.json`)**:
   - Stored runtime versions (Python 3.10.11, scikit-learn 1.5.0, numpy 1.26.4).
   - Stored calibrated decision thresholds ($p5$) and score percentiles ($p1$ to $p99$) for confidence mapping.
   - Stored per-feature genuine distribution statistics (mean, std, $p5$, $p50$, $p95$) for explanation feature.
5. **Score Distribution Plots & Training Report**:
   - Generated score distribution histograms with threshold overlays: `backend/reports/score_distribution_*.png`.
   - Generated `backend/reports/training_report.md` detailing cross-validation results, perturbation tests, and small-data caveats.
6. **Requirements Update**:
   - Updated `backend/requirements.txt` with pinned versions and removed `pymongo`.
   - Created `backend/requirements-train.txt` with `matplotlib` and `pytest`.

### How to Verify
- Check reports: `backend/reports/data_audit.md` and `backend/reports/training_report.md`.
- Inspect artifacts: `backend/model/model_*.pkl`, `scaler_*.pkl`, and `backend/model/model_meta.json`.
- Run parity test: `pytest backend/tests/test_feature_parity.py -v` (passes 100%).
- Run training pipeline: `python backend/training.py --csv backend/updated_pharma_dataset.csv`.

---

## [Phase 3] — Backend API Refactoring & Multi-Shot Support
*Date: 2026-10-02*

### What Changed
1. **Server Architecture Modernization & MongoDB Removal**:
   - Completely removed `pymongo`, database connection logic, and server-side scan history endpoints (`GET /history`, `DELETE /history/<id>`).
   - The server is strictly stateless and retains zero user scan images or records (privacy by design).
2. **Server-Side Quality Gate (`backend/quality.py`)**:
   - Added automated pre-inference quality checks for brightness (luminance $\in [60, 215]$), focus blur (normalized Laplacian variance), glare fraction ($> 4\%$ saturated pixels), and frame fill.
   - Images with severe quality degradation trigger a graceful `Inconclusive` response instructing the user to retake.
3. **Upgraded `POST /predict` API**:
   - Input validation: max file size (8 MB limit), MIME content-type checks, empty file guards.
   - Dynamic model routing by `shot_type`: directs request to `flash_on`, `flash_off`, or `pooled` models.
   - Replaced arbitrary sigmoid confidence with continuous calibration based on empirical training score percentiles ($p5, p50, p95$).
   - Returns full v2 response contract with `explanation`, `quality`, and `model` blocks.
4. **Multi-Shot Authentication `POST /predict-multi`**:
   - Accepts 2–3 photos (`flash_off`, `flash_on`, flipped angles) with accompanying `shots_meta`.
   - Scores each image against its corresponding illumination model.
   - Combines calibrated probabilities via median (3+ shots) or mean (2 shots), with agreement metric and disagreement safeguards.
5. **Explainable AI Engine (`backend/explanation.py`)**:
   - Computes per-feature $z$-scores ($\text{clamp} \pm 4.0$), status classification (`normal`, `borderline`, `abnormal`), and single-feature ablation impact.
   - Maps anomalous spectral deviations to plain-English descriptive diagnostic sentences.
6. **Backend Test Suite (`backend/tests/`)**:
   - Added 17 unit and integration tests covering parity, quality gate, explanation generator, `/predict`, and `/predict-multi`.

### How to Verify
- Run test suite: `pytest backend/tests/ -v` (all 17 tests pass).


