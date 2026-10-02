import { useState, useRef, useCallback, useEffect } from "react";
import "./App.css";
import { API, fetchWithTimeout, warmupServer } from "./api";
import CameraModule from "./components/CameraModule";
import ExplanationCard from "./components/ExplanationCard";
import LabelScanner from "./components/LabelScanner";
import MultiShotModule from "./components/MultiShotModule";
import { loadHistory, saveScan, deleteScan, clearHistory, exportHistory } from "./lib/storage";
import { checkExpiryStatus } from "./lib/expiry";
import { assessFrameQuality } from "./lib/quality";
import { isMedicineNameAllowed } from "./lib/medicineGuard";

/* ─── Tiny icon set ──────────────────────────────────────────────────────── */
const Ic = ({ d, size = 18, stroke = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);
const ICONS = {
  upload:   <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>,
  scan:     <><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></>,
  ok:       <><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></>,
  warn:     <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
  trash:    <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></>,
  clock:    <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
  x:        <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  pill:     <><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></>,
  chart:    <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
  eye:      <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></>,
  camera:   <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></>,
  flip:     <><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 .49-3.31"/></>,
  capture:  <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></>,
  retake:   <><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></>,
};
const Icon = ({ name, size, stroke }) => <Ic d={ICONS[name]} size={size} stroke={stroke} />;

/* ─── Animated scan line ─────────────────────────────────────────────────── */
const ScanLine = () => <div className="scan-line" aria-hidden="true" />;

/* ─── Radar / pulse ring ─────────────────────────────────────────────────── */
const PulseRing = ({ color }) => (
  <div className="pulse-wrap">
    <div className="pulse-ring" style={{ "--pc": color }} />
    <div className="pulse-ring r2" style={{ "--pc": color }} />
  </div>
);

/* ─── Server status banner ───────────────────────────────────────────────── */
const ServerBanner = ({ status }) => {
  if (status === "online") return null;
  const isWaking = status === "waking";
  return (
    <div className={`server-banner ${isWaking ? "sb-waking" : "sb-offline"}`}>
      <span className={`sb-dot ${isWaking ? "sb-dot-waking" : "sb-dot-offline"}`} />
      {isWaking
        ? "⏳ Server is waking up (free tier). This takes ~30 seconds on first load…"
        : "⚠️ Server offline or unreachable. Check your connection."}
    </div>
  );
};

/* ─── Confidence gauge ───────────────────────────────────────────────────── */
const Gauge = ({ value, color, label }) => {
  const pct = Math.round(value * 100);
  const r = 44, circ = 2 * Math.PI * r;
  const dash = circ * (1 - pct / 100);
  return (
    <div className="gauge-wrap">
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={dash}
          transform="rotate(-90 55 55)"
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)" }}
        />
        <text x="55" y="50" textAnchor="middle" fill={color}
          style={{ fontSize: 18, fontWeight: 700, fontFamily: "monospace" }}>{pct}%</text>
        <text x="55" y="66" textAnchor="middle" fill="rgba(255,255,255,0.4)"
          style={{ fontSize: 9 }}>confidence</text>
      </svg>
      <div className="gauge-label" style={{ color }}>{label}</div>
    </div>
  );
};

/* ─── Feature table ──────────────────────────────────────────────────────── */
const FeatureTable = ({ features }) => {
  const groups = [
    { title: "RGB",       keys: ["Mean_R","Mean_G","Mean_B"] },
    { title: "Ratios",    keys: ["R_G_Ratio","G_B_Ratio","R_B_Ratio"] },
    { title: "HSV",       keys: ["Mean_H","Mean_S","Mean_V"] },
    { title: "Intensity", keys: ["Mean_Intensity","Max_Intensity","Min_Intensity","Std_Intensity"] },
    { title: "Texture",   keys: ["Contrast","Homogeneity"] },
    { title: "Optical",   keys: ["Glossiness","Specular_Ratio"] },
  ];
  const colorOf = (key) => {
    if (key.includes("_R") || key.startsWith("R_")) return "#ff6b6b";
    if (key.includes("_G") || key.startsWith("G_")) return "#51cf66";
    if (key.includes("_B") || key.startsWith("B_")) return "#74c0fc";
    if (key.includes("_H")) return "#ffd43b";
    if (key.includes("_S")) return "#ff922b";
    if (key.includes("_V") || key.includes("Intensity")) return "#a9e34b";
    return "#94d82d";
  };
  return (
    <div className="feat-table">
      {groups.map(g => (
        <div key={g.title} className="feat-group">
          <div className="feat-group-title">{g.title}</div>
          {g.keys.filter(k => features[k] !== undefined).map(k => (
            <div key={k} className="feat-row">
              <span className="feat-key">{k}</span>
              <span className="feat-val" style={{ color: colorOf(k) }}>
                {Number(features[k]).toFixed(3)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

/* ─── History row ────────────────────────────────────────────────────────── */
const HistRow = ({ s, onDelete }) => {
  const isOk = s.result === "Genuine";
  const isInconc = s.result === "Inconclusive";
  const statusColor = isInconc ? "#ffd43b" : isOk ? "var(--ok)" : "var(--bad)";

  return (
    <div className="hist-row">
      {s.thumbnail ? (
        <img src={s.thumbnail} alt="thumb" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} />
      ) : (
        <div className="hist-icon" style={{ color: statusColor }}>
          <Icon name={isInconc ? "warn" : isOk ? "ok" : "warn"} size={16} />
        </div>
      )}
      <div className="hist-mid">
        <div className="hist-name">{s.medicine_name}</div>
        <div className="hist-sub">
          {s.batch_id ? `Batch ${s.batch_id} · ` : ""}
          <span style={{ color: statusColor, fontWeight: 600 }}>{s.result}</span>
          {` · ${Math.round((s.confidence || 0) * 100)}%`}
        </div>
      </div>
      <button className="del-btn" onClick={() => onDelete(s.scan_id)} title="Delete record">
        <Icon name="trash" size={14} />
      </button>
    </div>
  );
};

/* ─── Client thumbnail creator (<= 160px JPEG) ───────────────────────────── */
async function makeThumbnail(fileOrBlob) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      const url = URL.createObjectURL(fileOrBlob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        const maxDim = 140;
        let w = img.width, h = img.height;
        if (w > h) {
          if (w > maxDim) { h = Math.round((h * maxDim) / w); w = maxDim; }
        } else {
          if (h > maxDim) { w = Math.round((w * maxDim) / h); h = maxDim; }
        }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.65));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

/* ─── Pre-flight image & name validation ─────────────────────────────────── */
async function validateMedicineImage(file, medicineName) {
  return new Promise((resolve) => {
    // 1. Whole-word keyword guard
    const nameCheck = isMedicineNameAllowed(medicineName);
    if (!nameCheck.allowed) {
      resolve({
        valid: false,
        reason: `❌ "${medicineName}" doesn't look like a medicine name (matched non-medicine term: "${nameCheck.matchedTerm}"). Please enter the correct tablet or capsule name.`,
      });
      return;
    }

    // 2. Pixel-level analysis
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 100; canvas.height = 100;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, 100, 100);
      URL.revokeObjectURL(url);

      const { data } = ctx.getImageData(0, 0, 100, 100);
      const total = 10000;

      let green = 0, sky = 0, skin = 0, dark = 0;
      let sumR = 0, sumG = 0, sumB = 0;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        sumR += r; sumG += g; sumB += b;
        if (g > r + 40 && g > b + 40 && g > 80) green++;
        if (b > r + 30 && b > g + 10 && b > 100) sky++;
        if (r > 150 && g > 80 && g < 170 && b < 140 && r > g && g > b) skin++;
        if (r < 30 && g < 30 && b < 30) dark++;
      }

      const avgR = sumR / total, avgG = sumG / total, avgB = sumB / total;
      let uniform = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (
          Math.abs(data[i] - avgR) < 40 &&
          Math.abs(data[i+1] - avgG) < 40 &&
          Math.abs(data[i+2] - avgB) < 40
        ) uniform++;
      }

      const gPct = green / total;
      const sPct = sky / total;
      const kPct = skin / total;
      const dPct = dark / total;
      const uPct = uniform / total;

      if (gPct > 0.35) {
        resolve({ valid: false, reason: "❌ This looks like a plant, food, or nature photo. Please upload a close-up image of a tablet or capsule only." });
      } else if (sPct > 0.30) {
        resolve({ valid: false, reason: "❌ This looks like an outdoor or sky photo. Please upload a close-up image of a tablet or capsule only." });
      } else if (kPct > 0.25) {
        resolve({ valid: false, reason: "❌ This looks like a photo of a person. Please upload a close-up image of a tablet or capsule only." });
      } else if (dPct > 0.60) {
        resolve({ valid: false, reason: "❌ Image is too dark. Please take a photo of the tablet in good lighting on a plain white or light background." });
      } else if (uPct < 0.15) {
        resolve({ valid: false, reason: "❌ Image appears to be a complex scene. Please upload a close-up photo of the tablet or capsule only." });
      } else {
        resolve({ valid: true });
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ valid: false, reason: "❌ Could not read the image file. Please try a different image." });
    };

    img.src = url;
  });
}

/* ─── Main App Component ─────────────────────────────────────────────────── */
export default function App() {
  const [scanMode, setScanMode] = useState("quick"); // 'quick' | 'accurate'
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [medicine, setMedicine] = useState("");
  const [batchId, setBatchId] = useState("");
  const [scannedBatch, setScannedBatch] = useState(null);
  const [expiryDate, setExpiryDate] = useState("");
  const [expiryStatus, setExpiryStatus] = useState(null);

  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [uploadWarning, setUploadWarning] = useState(null);

  const [history, setHistory] = useState([]);
  const [histOpen, setHistOpen] = useState(false);
  const [featOpen, setFeatOpen] = useState(false);
  const [serverStatus, setServerStatus] = useState("unknown");

  const [showCameraModal, setShowCameraModal] = useState(false);
  const [showLabelScanner, setShowLabelScanner] = useState(false);
  const [shotType, setShotType] = useState("unknown");

  const fileRef = useRef();

  // Load history from private localStorage and sync
  const refreshHistory = useCallback(() => {
    const list = loadHistory();
    setHistory(list);
  }, []);

  useEffect(() => {
    setServerStatus("waking");
    warmupServer().then(() => setServerStatus("online")).catch(() => setServerStatus("offline"));
    refreshHistory();

    const handleSync = () => refreshHistory();
    window.addEventListener("storage", handleSync);
    window.addEventListener("medicheck-storage-update", handleSync);
    return () => {
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("medicheck-storage-update", handleSync);
    };
  }, [refreshHistory]);

  // Handle Expiry Date change
  const handleExpiryChange = (val) => {
    setExpiryDate(val);
    if (val) {
      setExpiryStatus(checkExpiryStatus(val));
    } else {
      setExpiryStatus(null);
    }
  };

  // Pre-flight file upload & local quality check
  const handleFile = useCallback((f) => {
    if (!f || !f.type.startsWith("image/")) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError(null);
    setUploadWarning(null);

    // Run client quality check on 160x120 canvas
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = 160; canvas.height = 120;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, 160, 120);
      const assessment = assessFrameQuality(ctx.getImageData(0, 0, 160, 120));
      if (!assessment.ok) {
        setUploadWarning(`Note: ${assessment.issue}. For highest accuracy, ensure steady lighting and sharp focus.`);
      }
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }, []);

  const onDrop = (e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); };

  // Single-shot prediction
  const analyze = async () => {
    if (!medicine.trim()) { setError("Please enter the medicine name before analysing."); return; }
    if (!file) { setError("Upload or capture a tablet image first."); return; }

    setValidating(true); setError(null); setResult(null);
    const validation = await validateMedicineImage(file, medicine);
    setValidating(false);

    if (!validation.valid) {
      setError(validation.reason);
      return;
    }

    setLoading(true); setError(null);
    const form = new FormData();
    form.append("image", file);
    form.append("medicine_name", medicine.trim());
    form.append("batch_id", batchId.trim());
    form.append("shot_type", shotType || "unknown");

    try {
      const res = await fetchWithTimeout(`${API}/predict`, { method: "POST", body: form }, 30000, 2);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");

      // Generate local thumbnail and save to private localStorage
      const thumb = await makeThumbnail(file);
      const scanRecord = {
        ...data,
        thumbnail: thumb,
        expiry: expiryDate,
      };
      saveScan(scanRecord);
      setResult(data);
      setServerStatus("online");
      refreshHistory();
    } catch (e) {
      setError(e.message.includes("unreachable")
        ? "⏳ Server is waking up (free tier). Please wait ~30 seconds and try again."
        : e.message);
      setServerStatus("waking");
    } finally {
      setLoading(false);
    }
  };

  // Multi-shot prediction
  const handleMultiSubmit = async (shotsArray) => {
    if (!medicine.trim()) {
      setError("Please enter the medicine name before analysing.");
      return;
    }

    setLoading(true); setError(null); setResult(null);

    const form = new FormData();
    shotsArray.forEach((s) => {
      form.append("images", s.file);
    });

    const shotsMeta = shotsArray.map((s) => ({
      shot_type: s.shot_type,
      angle: s.angle,
    }));
    form.append("shots_meta", JSON.stringify(shotsMeta));
    form.append("medicine_name", medicine.trim());
    form.append("batch_id", batchId.trim());

    try {
      const res = await fetchWithTimeout(`${API}/predict-multi`, { method: "POST", body: form }, 45000, 2);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error during multi-shot inference");

      // Generate local thumbnail from first shot
      const thumb = await makeThumbnail(shotsArray[0].file);
      const scanRecord = {
        ...data,
        thumbnail: thumb,
        expiry: expiryDate,
      };
      saveScan(scanRecord);
      setResult(data);
      setServerStatus("online");
      refreshHistory();
    } catch (e) {
      setError(e.message.includes("unreachable")
        ? "⏳ Server is waking up. Please wait ~30 seconds and try again."
        : e.message);
      setServerStatus("waking");
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setFile(null); setPreview(null); setResult(null); setError(null); setUploadWarning(null);
  };

  const delScan = (id) => {
    deleteScan(id);
    refreshHistory();
  };

  const isGenuine = result?.result === "Genuine";
  const isInconclusive = result?.result === "Inconclusive";
  const verdictColor = result
    ? isInconclusive ? "#ffd43b" : isGenuine ? "var(--ok)" : "var(--bad)"
    : "transparent";
  const isBusy = loading || validating;

  return (
    <div className="app">
      <div className="scanlines" aria-hidden="true" />
      <div className="ambient a1" /><div className="ambient a2" /><div className="ambient a3" />

      <ServerBanner status={serverStatus} />

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="hdr">
        <div className="hdr-left">
          <div className="logo-mark"><div className="logo-hex"><Icon name="pill" size={20} /></div></div>
          <div>
            <div className="logo-title">SPECTRAAUTH v2</div>
            <div className="logo-sub">Computational Spectral Authentication · Explainable AI</div>
          </div>
        </div>
        <div className="hdr-right">
          <div className={`status-dot ${serverStatus === "online" ? "" : "status-dot-warn"}`} />
          <span className="status-txt">
            {serverStatus === "online" ? "API Online" : serverStatus === "waking" ? "Waking up…" : serverStatus === "offline" ? "Offline" : "Connecting…"}
          </span>
          <button className="hist-btn" onClick={() => setHistOpen(v => !v)}>
            <Icon name="clock" size={16} /> Device History
            {history.length > 0 && <span className="badge">{history.length}</span>}
          </button>
        </div>
      </header>

      {/* ── Main grid ────────────────────────────────────────────────────── */}
      <main className="grid">
        <section className="card upload-card">
          <div className="card-title">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Icon name="scan" />
              <span>Spectral Tablet Scan</span>
            </div>
            <button
              type="button"
              className="scanner-trigger-btn"
              onClick={() => setShowLabelScanner(v => !v)}
              title="Scan packaging label or barcode"
            >
              🏷️ {showLabelScanner ? "Hide Scanner" : "Scan Label / QR"}
            </button>
          </div>

          {/* Mode Switcher */}
          <div className="scan-mode-selector">
            <button
              type="button"
              className={`scan-mode-btn ${scanMode === "quick" ? "active" : ""}`}
              onClick={() => setScanMode("quick")}
            >
              ⚡ Quick Scan (1 Photo)
            </button>
            <button
              type="button"
              className={`scan-mode-btn ${scanMode === "accurate" ? "active" : ""}`}
              onClick={() => setScanMode("accurate")}
            >
              🎯 Accurate Scan (2-3 Photos)
            </button>
          </div>

          {/* Expired Medicine Red Banner (Independent of verdict) */}
          {expiryStatus?.status === "expired" && (
            <div className="expired-alert-banner">
              <span style={{ fontSize: "1.3rem" }}>⚠️</span>
              <div>
                <b>EXPIRED MEDICINE WARNING:</b> This medicine reached its expiry date on{" "}
                <b>{expiryStatus.formattedExpiry}</b>. Do NOT consume under any circumstances.
              </div>
            </div>
          )}

          {/* Label & Barcode Scanner Panel */}
          {showLabelScanner && (
            <LabelScanner
              onBatchSelected={(b) => {
                setBatchId(b);
                setScannedBatch(b);
              }}
              onExpirySelected={(e) => handleExpiryChange(e)}
              onClose={() => setShowLabelScanner(false)}
            />
          )}

          {/* Metadata Fields */}
          <div className="fields" style={{ marginTop: "0.75rem" }}>
            <label className="lbl">
              Medicine Name<span className="star">*</span>
              <input
                className="inp"
                placeholder="e.g. Paracetamol 500mg, Carvedilol, Amoxicillin"
                value={medicine}
                onChange={e => setMedicine(e.target.value)}
              />
            </label>

            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <label className="lbl" style={{ flex: 1, minWidth: "140px" }}>
                Batch ID (optional)
                <input
                  className="inp"
                  placeholder="e.g. INP24CT69 or XEB0005"
                  value={batchId}
                  onChange={e => setBatchId(e.target.value)}
                />
                {scannedBatch && batchId && scannedBatch !== batchId && (
                  <div className="batch-mismatch-note">
                    ℹ️ Note: Edited batch differs from scanned label ({scannedBatch})
                  </div>
                )}
              </label>

              <label className="lbl" style={{ flex: 1, minWidth: "140px" }}>
                Expiry Date
                <div style={{ position: "relative" }}>
                  <input
                    className="inp"
                    placeholder="e.g. 08/2027"
                    value={expiryDate}
                    onChange={e => handleExpiryChange(e.target.value)}
                  />
                  {expiryStatus && expiryStatus.status !== "unknown" && (
                    <span
                      style={{
                        position: "absolute",
                        right: "8px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background:
                          expiryStatus.status === "valid" ? "rgba(0,168,107,0.15)" :
                          expiryStatus.status === "expiring_soon" ? "rgba(217,119,6,0.15)" : "rgba(224,40,74,0.15)",
                        color:
                          expiryStatus.status === "valid" ? "var(--ok)" :
                          expiryStatus.status === "expiring_soon" ? "#d97706" : "var(--bad)",
                      }}
                    >
                      {expiryStatus.status === "valid" ? "Valid" : expiryStatus.status === "expiring_soon" ? "Expiring soon" : "Expired"}
                    </span>
                  )}
                </div>
              </label>
            </div>
          </div>

          {/* Mode 1: Quick Scan */}
          {scanMode === "quick" && (
            <div style={{ marginTop: "1rem" }}>
              <div className="input-tabs">
                <button
                  type="button"
                  className="input-tab input-tab-active"
                  style={{ pointerEvents: "none" }}
                >
                  <Icon name="upload" size={14} /> Quick Capture / Upload
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ padding: "4px 12px", fontSize: "12px", borderColor: "var(--accent)", color: "var(--accent)" }}
                  onClick={() => setShowCameraModal(true)}
                >
                  📷 Open Live Camera Guidance
                </button>
              </div>

              {/* Upload Drop Zone */}
              <div
                className={`drop ${preview ? "drop-filled" : ""}`}
                onDrop={onDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => !preview && fileRef.current.click()}
              >
                {preview ? (
                  <>
                    <img src={preview} alt="tablet" className="drop-img" />
                    {isBusy && <ScanLine />}
                    <div className="drop-overlay">
                      <button className="chg-btn" onClick={e => { e.stopPropagation(); fileRef.current.click(); }}>
                        Change Image
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="drop-idle">
                    <div className="drop-icon-wrap"><Icon name="upload" size={30} /></div>
                    <p className="drop-title">Drop tablet image here or open camera</p>
                    <p className="drop-hint">JPG · PNG · WEBP · click to browse</p>
                    <p className="drop-hint" style={{ marginTop: 6, color: "var(--muted)", fontSize: 11 }}>
                      Position tablet centered on plain light background
                    </p>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => handleFile(e.target.files[0])} />

              {uploadWarning && (
                <div style={{ marginTop: "0.5rem", fontSize: "0.82rem", color: "#d97706", padding: "6px 10px", background: "rgba(217,119,6,0.08)", borderRadius: "6px" }}>
                  ⚠️ {uploadWarning}
                </div>
              )}

              <div className="btn-row" style={{ marginTop: "1rem" }}>
                <button className="btn-primary" onClick={analyze} disabled={isBusy || !file || !medicine.trim()}>
                  {validating
                    ? <><span className="spin-sm" />Validating image…</>
                    : loading
                    ? <><span className="spin-sm" />Analysing Spectral Signature…</>
                    : <><Icon name="scan" size={16} />Run Authentication</>}
                </button>
                {(file || result) && (
                  <button className="btn-ghost" onClick={clear} title="Clear"><Icon name="x" size={18} /></button>
                )}
              </div>
            </div>
          )}

          {/* Mode 2: Multi-Shot Mode */}
          {scanMode === "accurate" && (
            <MultiShotModule
              medicineName={medicine}
              batchId={batchId}
              isSubmitting={loading}
              onSubmitMulti={handleMultiSubmit}
            />
          )}

          {error && (
            <div className="err-box" style={{ marginTop: "1rem" }}>
              <Icon name="warn" size={15} />{error}
            </div>
          )}

          {result?.features && (
            <button className="feat-toggle" onClick={() => setFeatOpen(v => !v)}>
              <Icon name="chart" size={14} />
              {featOpen ? "Hide" : "Show"} Raw Spectral Feature Matrix ({Object.keys(result.features).length})
            </button>
          )}
          {featOpen && result?.features && <FeatureTable features={result.features} />}
        </section>

        {/* RIGHT — Result & Explainability */}
        <section className="card result-card">
          <div className="card-title"><Icon name="eye" /> Analysis Result</div>

          {!isBusy && !result && (
            <div className="idle">
              <div className="idle-rings">
                <div className="idle-ring r1" /><div className="idle-ring r2" /><div className="idle-ring r3" />
                <div className="idle-core"><Icon name="pill" size={28} /></div>
              </div>
              <h3>Ready to Authenticate</h3>
              <p>Upload a tablet photo or open the live guidance camera. The condition-specific Isolation Forest model inspects 17 colorimetric, GLCM texture, and optical reflectance parameters.</p>
              <div className="method-chips">
                <span className="chip">Explainable AI</span>
                <span className="chip">Optical Anomaly Detection</span>
                <span className="chip">Multi-Shot Support</span>
              </div>
            </div>
          )}

          {validating && (
            <div className="loading-state">
              <div className="loading-rings">
                <div className="l-ring l1" /><div className="l-ring l2" /><div className="l-ring l3" />
                <Icon name="eye" size={24} />
              </div>
              <p className="loading-txt">Validating image…</p>
              <p className="loading-sub">Checking tablet presence and framing</p>
            </div>
          )}

          {loading && !validating && (
            <div className="loading-state">
              <div className="loading-rings">
                <div className="l-ring l1" /><div className="l-ring l2" /><div className="l-ring l3" />
                <Icon name="scan" size={24} />
              </div>
              <p className="loading-txt">Extracting 17 spectral features…</p>
              <p className="loading-sub">Scoring with condition-specific Isolation Forest</p>
            </div>
          )}

          {!isBusy && result && (
            <div className="res-body">
              <div className="verdict-banner" style={{ "--vc": verdictColor }}>
                <PulseRing color={verdictColor} />
                <div className="verdict-center">
                  <div className={`verdict-icon ${isInconclusive ? "vi-warn" : isGenuine ? "vi-ok" : "vi-bad"}`}>
                    <Icon name={isInconclusive ? "warn" : isGenuine ? "ok" : "warn"} size={32} stroke={2} />
                  </div>
                  <div className="verdict-text" style={{ color: verdictColor }}>{result.result}</div>
                  <div className="verdict-med">{result.medicine_name}</div>
                  {result.batch_id && <div className="verdict-batch">Batch: {result.batch_id}</div>}
                  <div className="verdict-id">Scan #{result.scan_id}</div>
                </div>
              </div>

              {result.alert && (
                <div className="alert-banner">
                  <Icon name="warn" size={18} /><span>{result.alert}</span>
                </div>
              )}

              <div className="scores-row">
                <Gauge
                  value={result.confidence}
                  color={verdictColor}
                  label={isInconclusive ? "Uncertain Reading" : isGenuine ? "Genuine Match" : "Anomaly Detected"}
                />
                <div className="score-details">
                  <div className="score-item"><span className="si-label">Decision Score</span><span className="si-val mono">{result.decision_score}</span></div>
                  <div className="score-item"><span className="si-label">Anomaly Score</span><span className="si-val mono">{result.anomaly_score}</span></div>
                  <div className="score-item">
                    <span className="si-label">Model Condition</span>
                    <span className="si-val mono" style={{ color: verdictColor }}>
                      {result.model?.condition || "standard"}
                    </span>
                  </div>
                  {result.agreement !== undefined && (
                    <div className="score-item">
                      <span className="si-label">Shots Agreement</span>
                      <span className="si-val mono">{Math.round(result.agreement * 100)}%</span>
                    </div>
                  )}
                  <div className="score-item">
                    <span className="si-label">Timestamp</span>
                    <span className="si-val mono" style={{ fontSize: 11 }}>{new Date(result.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>

              {/* Explainable AI Diagnostics Card (Feature F2) */}
              {result.explanation && (
                <ExplanationCard explanation={result.explanation} isGenuine={isGenuine} />
              )}
            </div>
          )}
        </section>
      </main>

      {/* ── Live Guidance Camera Modal (Feature F1) ── */}
      {showCameraModal && (
        <CameraModule
          activeShotType={shotType}
          onCapture={(capturedFile, capturedShotType) => {
            handleFile(capturedFile);
            setShotType(capturedShotType);
            setShowCameraModal(false);
          }}
          onClose={() => setShowCameraModal(false)}
        />
      )}

      {/* ── Private Device History Drawer (Feature F5) ── */}
      {histOpen && (
        <div className="drawer-bg" onClick={() => setHistOpen(false)}>
          <aside className="drawer" onClick={e => e.stopPropagation()}>
            <div className="drawer-head">
              <span><Icon name="clock" size={16} /> Device Scan History</span>
              <button onClick={() => setHistOpen(false)}><Icon name="x" size={20} /></button>
            </div>

            <div style={{ padding: "0.5rem 1rem", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", color: "var(--muted)" }}>
              <span>🔒 Stored on this device only</span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: "0.78rem" }}
                  onClick={exportHistory}
                >
                  ⬇ Export
                </button>
                {history.length > 0 && (
                  <button
                    type="button"
                    style={{ background: "transparent", border: "none", color: "var(--bad)", cursor: "pointer", fontSize: "0.78rem" }}
                    onClick={() => {
                      if (window.confirm("Clear all private history on this device?")) {
                        clearHistory();
                        refreshHistory();
                      }
                    }}
                  >
                    🗑 Clear
                  </button>
                )}
              </div>
            </div>

            {history.length === 0
              ? <p className="no-hist">No scans yet. Authenticate tablets to populate local history.</p>
              : history.map(s => <HistRow key={s.scan_id} s={s} onDelete={delScan} />)}
          </aside>
        </div>
      )}
    </div>
  );
}