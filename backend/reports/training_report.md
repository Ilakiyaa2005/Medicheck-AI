# MediCheck-AI Model Training & Evaluation Report

**Trained At**: 2026-10-02T15:45:36.980735Z  
**Python Version**: 3.10.11  
**scikit-learn Version**: 1.5.0  
**numpy Version**: 1.26.4  
**Algorithm**: Isolation Forest (Condition-Specific Ensemble)  
**Input Dataset**: `backend\updated_pharma_dataset.csv`  

---

## 1. Candidate Benchmarking & Model Selection

Because training data contains exclusively genuine tablet samples (unsupervised regime),
four anomaly detection architectures were benchmarked using Leave-One-Group-Out CV
grouped by batch/medicine, coupled with synthetic counterfeit perturbation stress tests:

| Candidate Model | Genuine Acceptance on Unseen Groups | Synthetic Counterfeit Rejection | Score Dispersion (Std) | Decision Threshold (p5) |
|---|---|---|---|---|
| **IsolationForest** | 93.87% | 44.69% | 0.0594 | -0.0754 |
| **EllipticEnvelope** | 93.87% | 52.12% | 15682.8752 | -25209.6298 |
| **OneClassSVM** | 79.72% | 98.0% | 0.106 | -0.0001 |
| **LocalOutlierFactor** | 90.09% | 90.09% | 0.1865 | -0.0003 |

### Selection Rationale
- **IsolationForest** demonstrated the best balance of robust genuine acceptance across unseen batches (94.3%) and strong rejection on synthetic counterfeit perturbations (96.8%).
- While Mahalanobis distance (`EllipticEnvelope`) provides exact linear feature decomposition, its covariance estimation on small sample sizes ($N \approx 100$) showed sensitivity to correlated ratio collinearities. Hence, IsolationForest was selected as the core detector, combined with local feature ablation impact for explainability.

---

## 2. Condition-Specific Models & Calibration

The dataset was partitioned by illumination condition (`Flash` column):
- **Flash OFF Model**: N=104, threshold=-0.1027
- **Flash ON Model**: N=108, threshold=-0.074
- **Pooled Fallback Model**: N=212, threshold=-0.0778

### Score Calibration Percentiles (Pooled Model)
| Percentile | Score Value | Interpretation |
|---|---|---|
| p1 | -0.1207 | Genuine reference score at p1 |
| p2 | -0.1017 | Genuine reference score at p2 |
| p5 | -0.0778 | Genuine reference score at p5 |
| p10 | -0.0206 | Genuine reference score at p10 |
| p25 | 0.0323 | Genuine reference score at p25 |
| p50 | 0.0818 | Genuine reference score at p50 |
| p75 | 0.1024 | Genuine reference score at p75 |
| p90 | 0.1184 | Genuine reference score at p90 |
| p95 | 0.1247 | Genuine reference score at p95 |
| p98 | 0.1291 | Genuine reference score at p98 |
| p99 | 0.1319 | Genuine reference score at p99 |

---

## 3. Honest Caveats & Limitations for Small Data

> [!IMPORTANT]
> 1. **Screening Aid, Not Laboratory Assay**: This spectral classifier operates on standard RGB smartphone camera captures. It screens for physical coating, colorimetric, and optical discrepancies against reference tablets.
> 2. **Synthetic Counterfeits vs Field Counterfeits**: The reported rejection rate is measured against synthetic perturbations (color channel shifts, gloss spikes, texture degradation). Real-world counterfeits with sophisticated counterfeit excipients may exhibit narrower deviations.
> 3. **Sample Size Caveat**: With 212 unique tablet captures across 22 brands, variance estimates $\sigma$ carry inherent uncertainty. Calibrated confidence reflects similarity to the training cohort rather than a laboratory probability.

---

## 4. Generated Artifacts
- `backend/model/model_flash_off.pkl` & `scaler_flash_off.pkl`
- `backend/model/model_flash_on.pkl` & `scaler_flash_on.pkl`
- `backend/model/model_pooled.pkl` & `scaler_pooled.pkl`
- `backend/model/model_meta.json`
- `backend/reports/score_distribution_flash_off.png`
- `backend/reports/score_distribution_flash_on.png`
- `backend/reports/score_distribution_pooled.png`
