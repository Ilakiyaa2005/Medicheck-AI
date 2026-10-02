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

---

## [Phase 4] — Frontend Upgrade: Camera Guidance, Explainable AI, OCR/QR, Multi-Shot & Storage
*Date: 2026-10-02*

### What Changed
1. **Zero-Database Client Architecture (`web-app/src/lib/storage.js`)**:
   - Implemented pure client-side `localStorage` manager capped at 100 scans.
   - Built quota fallback mechanism: strips base64 thumbnails and prunes oldest records if quota exceeded.
   - Supports JSON export and import, with cross-tab reactive synchronization via `medicheck-storage-update`.
2. **Real-Time Viewfinder & Camera Guidance (`web-app/src/components/CameraModule.jsx`)**:
   - Real-time computer vision frame analysis (`web-app/src/lib/quality.js`): brightness, discrete Laplacian variance blur, specular glare fraction, inter-frame motion diff, and guide box fill ratio.
   - Single prioritized guidance pill ("Hold steady...", "Move closer...", "Too dark...", "Ready") with severity indicators.
   - Live circular progress ring for steady-frame detection and automatic 1.5s countdown capture.
   - Hardware torch toggle (`torch: true` track constraint with fallback instruction).
   - High-resolution unconstrained video track capture for sharpest OCR and tablet analysis.
3. **Interactive Explainable AI Card (`web-app/src/components/ExplanationCard.jsx`)**:
   - Displays top 3 plain-English diagnostic reasons explaining why a medicine was rated Genuine or Anomalous.
   - Grouped horizontal diverging bar chart centered at $0\sigma$ reference, with visual normal range band ($-1.96\sigma$ to $+1.96\sigma$).
   - Color-coded per-feature deviation bars (green: normal, amber: borderline, red: abnormal) with accessible numeric readouts.
4. **Pharmaceutical Expiry & Label Parser (`web-app/src/lib/expiry.js`, `web-app/src/lib/labelParser.js`)**:
   - End-of-month valid logic: "EXP 08/2027" remains valid until 23:59:59.999 on August 31, 2027.
   - Leap year and month-end day computation for all 12 months.
   - Full regex extraction for Indian blister pack formats (`B.No.`, `Batch:`, `Lot No.`, `EXP. DATE:`, `MFG.`).
   - OCR character confusion normalization (`O` -> `0`, `I` -> `1`, `S` -> `5`, `B` -> `8`).
   - GS1 Datamatrix / QR Application Identifier parser extracting GTIN `(01)`, Expiry `(17)`, Batch `(10)`, and Serial `(21)`.
5. **Interactive Label Scanner Component (`web-app/src/components/LabelScanner.jsx`)**:
   - Native `BarcodeDetector` with automatic fallback to `@zxing/browser` MultiFormatReader.
   - Lazy-loaded Tesseract.js worker with live progress bar and status indicator.
   - Extracted batch and expiry candidate chips for one-tap auto-filling into scan inputs.
   - Plaintext display of QR payloads to protect users against malicious URLs.
6. **Multi-Shot Guided Verification (`web-app/src/components/MultiShotModule.jsx`)**:
   - Step-by-step guided capture for 2–3 photos: Shot 1 (Flash OFF), Shot 2 (Flash ON), Shot 3 (flipped/tilted).
   - Independent photo cards with thumbnail preview, client-side quality metrics, and retake controls.
   - Integrated call to `POST /predict-multi` displaying per-shot scores, overall verdict, and consensus indicator.
7. **Refactored Dashboard & History (`web-app/src/Dashboard.jsx`)**:
   - Replaced server fetch with local `storage.js` operations.
   - Added JSON export button, "Clear History" button, and on-device privacy guarantee notice.
8. **App Integration & Guard Decoupling (`web-app/src/App.jsx`, `web-app/src/lib/medicineGuard.js`)**:
   - Added quick vs. multi-shot mode toggle.
   - Decoupled `isMedicineNameAllowed` to standalone helper with whole-word regex matching.
   - Added prominent red warning banner when scanned or entered medicine is expired.
9. **Frontend Vitest Test Suite (`web-app/src/__tests__/`)**:
   - Added 29 unit tests across 5 test files (`quality.test.js`, `expiry.test.js`, `labelParser.test.js`, `medicineGuard.test.js`, `storage.test.js`). All 29 tests pass.
   - Verified clean production Vite build with chunked lazy-loading.

### How to Verify
- Run frontend tests: `cd web-app && npm.cmd test` (29/29 pass).
- Run production build: `cd web-app && npm.cmd run build` (builds cleanly in dist/).

---

## [Phase 5] — Polish, Documentation & Review
*Date: 2026-10-02*

### What Changed
1. **Landing Page Refinement (`web-app/src/Landing.jsx`)**:
   - Removed all unverified claims of database persistence, user accounts, and speculative clinical metrics.
   - Reflected verified system performance: 93.9% (~94%) unseen batch genuine retention in Leave-One-Group-Out CV, 17 extracted optical/spectral features, and 200 isolation trees per model.
   - Highlighted core value propositions: 100% on-device privacy (zero cloud database, zero server logs), live camera quality gates, label OCR & GS1 QR decoding, and explainable AI feature deviation diagnostics.
   - Added honest scientific disclaimer in footer emphasizing role as a preliminary screening tool rather than a replacement for laboratory chemical assays (HPLC).
2. **Comprehensive Project Documentation (`README.md`)**:
   - Authored complete root documentation covering high-level architecture diagram, machine learning rationale (why unsupervised anomaly detection on genuine-only pharma dataset), model benchmarking metrics, local quick-start guide, retraining commands, API contracts, quality tuning configuration, and real-world optical limitations.
3. **Repository Cleanliness (`.gitignore`)**:
   - Expanded `.gitignore` with Python virtual environments, compiled bytecode, test artifacts (`.pytest_cache/`, `.coverage`), Vite build outputs (`dist/`, `web-app/dist/`), environment variable files, and OS artifacts.
4. **Complete Verification & Validation**:
   - Backend test suite: 17/17 pytest tests pass.
   - Frontend test suite: 29/29 Vitest tests pass.
   - Production Vite bundle: builds cleanly with code splitting and chunked lazy loading.

### How to Verify
- Run backend tests: `pytest backend/tests/ -v` (17 passed).
- Run frontend tests: `cd web-app && npm.cmd test` (29 passed).
- Run production build: `cd web-app && npm.cmd run build` (clean build).


