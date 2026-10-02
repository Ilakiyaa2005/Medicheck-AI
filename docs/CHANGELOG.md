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
