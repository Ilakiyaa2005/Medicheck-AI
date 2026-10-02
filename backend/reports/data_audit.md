# MediCheck-AI Dataset Audit Report

**Dataset File**: `backend/updated_pharma_dataset.csv`  
**Audit Timestamp**: 2026-10-02T21:12:02.506886  
**Total Records**: 215  
**Total Columns**: 27  

---

## 1. Executive Summary & Training Feasibility

- **Raw Images**: Not found in repository (Option B active)
- **Label Column Present**: No (Unsupervised Genuine-Only Anomaly Detection required)
- **Counterfeit / Fake Samples**: None present in dataset (215 genuine tablets)
- **Feature Coverage**: 17/17 canonical features present. Missing: None
- **Extra Metadata Columns**: ['Intensity_Range', 'Peak_Intensity_Ratio', 'Estimated_Wavelength']
- **Duplicate Feature Vectors**: 3 exact duplicate rows identified and flagged for removal
- **Missing / NaN Values**: None in feature matrix

### Condition-Specific Training Viability
- **Flash OFF Samples**: 107 (Requirement: >= 60 -> **VIABLE**)
- **Flash ON Samples**: 108 (Requirement: >= 60 -> **VIABLE**)
Per project brief Section 3.5, condition-specific models (`flash_off`, `flash_on`) plus a `pooled` fallback model will be trained.

---

## 2. Feature Value Ranges & Scale Validation

| Feature | Min | Max | Mean | Std | Scale Note |
|---|---|---|---|---|---|
| Mean_R | 102.2733 | 235.7482 | 177.8087 | 28.1789 | [0, 255] RGB/Gray |
| Mean_G | 34.8753 | 212.6323 | 142.3277 | 34.7362 | [0, 255] RGB/Gray |
| Mean_B | 28.3308 | 174.7766 | 108.5548 | 29.5487 | [0, 255] RGB/Gray |
| R_G_Ratio | 0.8176 | 3.1628 | 1.3196 | 0.3761 | Normal |
| G_B_Ratio | 0.5815 | 3.084 | 1.3552 | 0.3213 | Normal |
| R_B_Ratio | 0.832 | 5.0291 | 1.7648 | 0.5659 | Normal |
| Mean_H | 11.9283 | 173.8081 | 28.9274 | 36.1332 | [0, 180] scale (OpenCV) |
| Mean_S | 0.1274 | 0.8187 | 0.4214 | 0.1543 | [0, 1] scale (Normalized) |
| Mean_V | 0.4011 | 0.9245 | 0.7023 | 0.1053 | [0, 1] scale (Normalized) |
| Contrast | 5.3174 | 2219.6564 | 131.4045 | 253.58 | Normal |
| Homogeneity | 0.0574 | 0.5857 | 0.2582 | 0.1102 | Normal |
| Mean_Intensity | 57.6745 | 214.7802 | 149.0864 | 29.8689 | [0, 255] RGB/Gray |
| Max_Intensity | 162.987 | 255.0 | 245.2103 | 14.4167 | [0, 255] RGB/Gray |
| Min_Intensity | 0.0 | 116.462 | 45.1171 | 36.3104 | [0, 255] RGB/Gray |
| Std_Intensity | 7.6812 | 72.8158 | 26.7702 | 12.6199 | Normal |
| Glossiness | 7.3474 | 69.8278 | 25.9887 | 12.5103 | Normal |
| Specular_Ratio | 0.0 | 0.8922 | 0.0962 | 0.1455 | Normal |

### Scale Mismatch Resolution
- `Mean_S` values span `[0.1274, 0.8187]`: confirmed canonical scale `[0, 1]`.
- `Mean_V` values span `[0.4011, 0.9245]`: confirmed canonical scale `[0, 1]`.
- `Mean_H` values span `[11.9283, 173.8081]`: confirmed OpenCV Hue scale `[0, 180]`.
- Train/serve skew resolved in `features.py` by scaling S and V channels by `1/255.0`.

---

## 3. Categorical Distributions (Post-Normalization)

### Flash Condition
| Condition | Count | Percentage |
|---|---|---|
| ON | 108 | 50.2% |
| OFF | 107 | 49.8% |

### Capture Angle
| Angle | Count | Percentage |
|---|---|---|
| TOP | 113 | 52.6% |
| BOTTOM | 102 | 47.4% |

### Medicines Represented (Top 10 of 22)
| Medicine Name | Sample Count |
|---|---|
| Diclofenac sodium,paracetamol and chlorzoxazone tablets | 12 |
| Aciclofenac | 12 |
| Azithromycin - 500 mg | 12 |
| cetirizine - 10 mg | 12 |
| Amoxycillin & Potassium clavunate - 625 mg | 12 |
| Lopramide | 12 |
| Nimesulide and Paracetamol | 12 |
| OMEPRAZOLE | 12 |
| cefixim - 200 | 12 |
| Ranitidine | 12 |

*Total Unique Medicines: 21*

### Batch Numbers
| Batch Identifier | Sample Count |
|---|---|
| - | 164 |
| INP24CT69 | 12 |
| XED0004 | 12 |
| FFT241205 | 6 |
| XEB0005 | 4 |
| T-048 | 4 |
| TA - 118 | 4 |
| HP-MNB-LL-00054 | 4 |
| PURAC12 | 3 |
| nan | 1 |
| vitamin b complex tabletsnfi 1979 TA - 118 | 1 |

### Smartphones Used for Capture
| Device / Sensor | Sample Count |
|---|---|
| OPPO A17K | 71 |
| POCOC55 | 67 |
| VIVO Y20G | 61 |
| POCOC55 , Vivo Y20G,Oppo A17K | 13 |
| OPPO A17K,Vivo Y20G | 2 |
| VIVI=O Y20G | 1 |

---

## 4. Audit Conclusions & Modeling Directives
1. **Option B Selected**: No raw images exist; pre-computed features in `updated_pharma_dataset.csv` serve as the source of truth.
2. **Unsupervised Anomaly Detection Required**: Because zero counterfeit samples exist in training, a supervised classifier cannot be trained. Anomaly detectors fitted purely on genuine samples will be benchmarked.
3. **Percentile-Based Calibration**: Replace artificial 5% contamination with a percentile threshold (3rd-5th percentile) calibrated on cross-validated scores.
4. **Condition Models**: Dedicated models for `flash_off` (106 samples) and `flash_on` (108 samples) plus a `pooled` model (212 unique samples) will be trained and bundled.
