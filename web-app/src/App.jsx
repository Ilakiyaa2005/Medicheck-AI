import { useState, useRef, useCallback, useEffect } from "react";
import "./App.css";

const API = "https://medicheck-ai-njtm.onrender.com";

/* ─── tiny icon set ──────────────────────────────────────────────────────── */
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
    { title: "RGB", keys: ["Mean_R", "Mean_G", "Mean_B"] },
    { title: "Ratios", keys: ["R_G_Ratio", "G_B_Ratio", "R_B_Ratio"] },
    { title: "HSV", keys: ["Mean_H", "Mean_S", "Mean_V"] },
    { title: "Intensity", keys: ["Mean_Intensity", "Max_Intensity", "Min_Intensity", "Std_Intensity"] },
    { title: "Texture", keys: ["Contrast", "Homogeneity"] },
    { title: "Optical", keys: ["Glossiness", "Specular_Ratio"] },
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
                {features[k].toFixed(3)}
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
  const ok = s.result === "Genuine";
  return (
    <div className={`hist-row ${ok ? "hist-ok" : "hist-bad"}`}>
      <div className={`hist-dot ${ok ? "dot-ok" : "dot-bad"}`} />
      <div className="hist-info">
        <span className="hist-med">{s.medicine_name}</span>
        {s.batch_id && <span className="hist-batch">Batch: {s.batch_id}</span>}
        <span className="hist-time">{new Date(s.timestamp).toLocaleString()}</span>
      </div>
      <div className="hist-right">
        <span className={`hist-verdict ${ok ? "hv-ok" : "hv-bad"}`}>{s.result}</span>
        <span className="hist-conf">{Math.round(s.confidence * 100)}%</span>
      </div>
      <button className="hist-del" onClick={() => onDelete(s.scan_id)} title="Delete">
        <Icon name="trash" size={13} />
      </button>
    </div>
  );
};

/* ─── Camera Module ──────────────────────────────────────────────────────── */
const CameraModule = ({ onCapture, loading }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState(null);
  const [facingMode, setFacingMode] = useState("environment"); // "environment" = back cam
  const [captured, setCaptured] = useState(null); // data URL of snapshot

  const startCamera = useCallback(async (facing) => {
    // Stop any existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCamReady(false);
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setCamReady(true);
        };
      }
    } catch (err) {
      setCamError(
        err.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera access in your browser."
          : err.name === "NotFoundError"
          ? "No camera device found on this device."
          : `Camera error: ${err.message}`
      );
    }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [facingMode, startCamera]);

  const flipCamera = () => {
    setCaptured(null);
    setFacingMode(f => (f === "environment" ? "user" : "environment"));
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    // Mirror horizontally if using front camera
    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCaptured(dataUrl);
  };

  const retake = () => setCaptured(null);

  const usePhoto = () => {
    if (!captured) return;
    // Convert data URL to File object
    const byteString = atob(captured.split(",")[1]);
    const mimeString = captured.split(",")[0].split(":")[1].split(";")[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: mimeString });
    const file = new File([blob], `tablet_capture_${Date.now()}.jpg`, { type: mimeString });
    onCapture(file, captured);
  };

  if (camError) {
    return (
      <div className="cam-error">
        <Icon name="warn" size={28} />
        <p>{camError}</p>
        <button className="btn-ghost" onClick={() => startCamera(facingMode)}>Retry</button>
      </div>
    );
  }

  return (
    <div className="cam-wrap">
      {/* Live viewfinder or captured snapshot */}
      <div className="cam-viewport">
        {/* Always render video so ref stays valid; hide when snapshot taken */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="cam-video"
          style={{
            display: captured ? "none" : "block",
            transform: facingMode === "user" ? "scaleX(-1)" : "none",
          }}
        />
        {captured && (
          <img src={captured} alt="Captured tablet" className="cam-snapshot" />
        )}
        {!camReady && !captured && (
          <div className="cam-loading">
            <span className="spin-sm" style={{ width: 24, height: 24, borderWidth: 3 }} />
            <span>Starting camera…</span>
          </div>
        )}
        {/* Targeting overlay — only when live */}
        {camReady && !captured && (
          <div className="cam-overlay" aria-hidden="true">
            <div className="cam-bracket tl" />
            <div className="cam-bracket tr" />
            <div className="cam-bracket bl" />
            <div className="cam-bracket br" />
            <div className="cam-guide">Position tablet in frame</div>
          </div>
        )}
        {loading && captured && <ScanLine />}
      </div>

      {/* Hidden canvas for snapshot */}
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Controls */}
      <div className="cam-controls">
        {!captured ? (
          <>
            <button className="cam-flip-btn" onClick={flipCamera} title="Flip camera" disabled={!camReady}>
              <Icon name="flip" size={18} />
            </button>
            <button
              className="cam-shutter"
              onClick={capturePhoto}
              disabled={!camReady}
              title="Take photo"
            >
              <Icon name="capture" size={28} />
            </button>
            <div style={{ width: 44 }} /> {/* spacer to center shutter */}
          </>
        ) : (
          <>
            <button className="cam-flip-btn" onClick={retake} title="Retake">
              <Icon name="retake" size={18} />
              <span style={{ fontSize: 11, marginTop: 2 }}>Retake</span>
            </button>
            <button className="btn-primary cam-use-btn" onClick={usePhoto}>
              <Icon name="ok" size={16} /> Use Photo
            </button>
          </>
        )}
      </div>
    </div>
  );
};

/* ─── Main App ───────────────────────────────────────────────────────────── */
export default function App() {
  const [file,       setFile]       = useState(null);
  const [preview,    setPreview]    = useState(null);
  const [medicine,   setMedicine]   = useState("");
  const [batchId,    setBatchId]    = useState("");
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState(null);
  const [error,      setError]      = useState(null);
  const [history,    setHistory]    = useState([]);
  const [histOpen,   setHistOpen]   = useState(false);
  const [featOpen,   setFeatOpen]   = useState(false);
  const [inputMode,  setInputMode]  = useState("upload"); // "upload" | "camera"
  const fileRef = useRef();

  useEffect(() => {
    fetch(`${API}/history`).then(r => r.json()).then(d => setHistory(d.scans || [])).catch(() => {});
  }, []);

  const handleFile = useCallback((f) => {
    if (!f || !f.type.startsWith("image/")) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError(null);
  }, []);

  // Called by CameraModule when user taps "Use Photo"
  const handleCameraCapture = useCallback((file, dataUrl) => {
    setFile(file);
    setPreview(dataUrl);
    setResult(null);
    setError(null);
    // Switch to upload view to show preview + run analysis
    setInputMode("upload");
  }, []);

  const onDrop = (e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); };

  const analyze = async () => {
  if (!medicine.trim()) { setError("Please enter the medicine name before analysing."); return; }
  if (!file) { setError("Upload or capture a tablet image first."); return; }
    setLoading(true); setError(null); setResult(null);
    const form = new FormData();
    form.append("image", file);
    form.append("medicine_name", medicine || "Unknown");
    form.append("batch_id", batchId || "");
    try {
      const res  = await fetch(`${API}/predict`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");
      setResult(data);
      setHistory(p => [data, ...p].slice(0, 100));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setFile(null); setPreview(null); setResult(null); setError(null);
  };

  const delScan = async (id) => {
    await fetch(`${API}/history/${id}`, { method: "DELETE" }).catch(() => {});
    setHistory(p => p.filter(s => s.scan_id !== id));
  };

  const isGenuine = result?.result === "Genuine";
  const verdictColor = result ? (isGenuine ? "var(--ok)" : "var(--bad)") : "transparent";

  return (
    <div className="app">
      {/* scanline texture overlay */}
      <div className="scanlines" aria-hidden="true" />
      <div className="ambient a1" /><div className="ambient a2" /><div className="ambient a3" />

      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="hdr">
        <div className="hdr-left">
          <div className="logo-mark">
            <div className="logo-hex"><Icon name="pill" size={20} /></div>
          </div>
          <div>
            <div className="logo-title">SPECTRAAUTH</div>
            <div className="logo-sub">Computational Spectral Authentication · Anomaly Detection</div>
          </div>
        </div>
        <div className="hdr-right">
          <div className="status-dot" />
          <span className="status-txt">API Online</span>
          <button className="hist-btn" onClick={() => setHistOpen(v => !v)}>
            <Icon name="clock" size={16} /> History
            {history.length > 0 && <span className="badge">{history.length}</span>}
          </button>
        </div>
      </header>

      {/* ── Main grid ────────────────────────────────────────────────── */}
      <main className="grid">

        {/* LEFT — Upload & controls */}
        <section className="card upload-card">
          <div className="card-title"><Icon name="scan" /> Spectral Scan</div>

          {/* Medicine / batch inputs */}
          <div className="fields">
              <label className="lbl">
  Medicine Name<span className="star">*</span>

              <input className="inp" placeholder="e.g. Paracetamol 500mg" value={medicine} onChange={e => setMedicine(e.target.value)} />
            </label>
            <label className="lbl">Batch ID (optional)
              <input className="inp" placeholder="e.g. BT-2024-001" value={batchId} onChange={e => setBatchId(e.target.value)} />
            </label>
          </div>

          {/* ── Input mode tabs ──────────────────────────────────────── */}
          <div className="input-tabs">
            <button
              className={`input-tab ${inputMode === "upload" ? "input-tab-active" : ""}`}
              onClick={() => setInputMode("upload")}
            >
              <Icon name="upload" size={14} /> Upload
            </button>
            <button
              className={`input-tab ${inputMode === "camera" ? "input-tab-active" : ""}`}
              onClick={() => setInputMode("camera")}
            >
              <Icon name="camera" size={14} /> Camera
            </button>
          </div>

          {/* ── Upload mode ──────────────────────────────────────────── */}
          {inputMode === "upload" && (
            <>
              <div className={`drop ${preview ? "drop-filled" : ""}`}
                onDrop={onDrop} onDragOver={e => e.preventDefault()}
                onClick={() => !preview && fileRef.current.click()}>
                {preview ? (
                  <>
                    <img src={preview} alt="tablet" className="drop-img" />
                    {loading && <ScanLine />}
                    <div className="drop-overlay">
                      <button className="chg-btn" onClick={e => { e.stopPropagation(); fileRef.current.click(); }}>Change Image</button>
                    </div>
                  </>
                ) : (
                  <div className="drop-idle">
                    <div className="drop-icon-wrap"><Icon name="upload" size={30} /></div>
                    <p className="drop-title">Drop tablet image here</p>
                    <p className="drop-hint">JPG · PNG · WEBP · click to browse</p>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => handleFile(e.target.files[0])} />
            </>
          )}

          {/* ── Camera mode ──────────────────────────────────────────── */}
          {inputMode === "camera" && (
            <CameraModule onCapture={handleCameraCapture} loading={loading} />
          )}

          {/* Buttons — only show in upload mode (camera has its own CTA) */}
          {inputMode === "upload" && (
            <div className="btn-row">
                 <button className="btn-primary" onClick={analyze} disabled={loading || !file || !medicine.trim()}>
                 {loading
                  ? <><span className="spin-sm" />Analysing…</>
                  : <><Icon name="scan" size={16} />Run Spectral Analysis</>}
              </button>
              {(file || result) && (
                <button className="btn-ghost" onClick={clear} title="Clear"><Icon name="x" size={18} /></button>
              )}
            </div>
          )}

          {/* Analyze button also shown after camera capture lands back in upload mode */}
          {inputMode === "upload" && error && (
            <div className="err-box"><Icon name="warn" size={15} />{error}</div>
          )}

          {/* Feature toggle button (post result) */}
          {result?.features && (
            <button className="feat-toggle" onClick={() => setFeatOpen(v => !v)}>
              <Icon name="chart" size={14} />
              {featOpen ? "Hide" : "Show"} Extracted Features ({Object.keys(result.features).length})
            </button>
          )}
          {featOpen && result?.features && <FeatureTable features={result.features} />}
        </section>

        {/* RIGHT — Result */}
        <section className="card result-card">
          <div className="card-title"><Icon name="eye" /> Analysis Result</div>

          {!loading && !result && (
            <div className="idle">
              <div className="idle-rings">
                <div className="idle-ring r1" /><div className="idle-ring r2" /><div className="idle-ring r3" />
                <div className="idle-core"><Icon name="pill" size={28} /></div>
              </div>
              <h3>Ready to Authenticate</h3>
              <p>Upload or capture a tablet image. The Isolation Forest model will compare its spectral signature against the genuine profile and flag anomalies.</p>
              <div className="method-chips">
                
                
                <span className="chip">Anomaly Detection</span>
               
              </div>
            </div>
          )}

          {loading && (
            <div className="loading-state">
              <div className="loading-rings">
                <div className="l-ring l1" /><div className="l-ring l2" /><div className="l-ring l3" />
                <Icon name="scan" size={24} />
              </div>
              <p className="loading-txt">Extracting spectral features…</p>
              <p className="loading-sub">Running Isolation Forest anomaly detection</p>
            </div>
          )}

          {!loading && result && (
            <div className="res-body">
              {/* Verdict banner */}
              <div className="verdict-banner" style={{ "--vc": verdictColor }}>
                <PulseRing color={verdictColor} />
                <div className="verdict-center">
                  <div className={`verdict-icon ${isGenuine ? "vi-ok" : "vi-bad"}`}>
                    <Icon name={isGenuine ? "ok" : "warn"} size={32} stroke={2} />
                  </div>
                  <div className="verdict-text" style={{ color: verdictColor }}>{result.result}</div>
                  <div className="verdict-med">{result.medicine_name}</div>
                  {result.batch_id && <div className="verdict-batch">Batch: {result.batch_id}</div>}
                  <div className="verdict-id">Scan #{result.scan_id}</div>
                </div>
              </div>

              {/* Alert */}
              {!isGenuine && (
                <div className="alert-banner">
                  <Icon name="warn" size={18} />
                  <span>{result.alert}</span>
                </div>
              )}

              {/* Gauge + scores */}
              <div className="scores-row">
                <Gauge value={result.confidence} color={verdictColor}
                  label={isGenuine ? "Genuine Match" : "Anomaly Detected"} />
                <div className="score-details">
                  <div className="score-item">
                    <span className="si-label">Anomaly Score</span>
                    <span className="si-val mono">{result.anomaly_score}</span>
                  </div>
                  <div className="score-item">
                    <span className="si-label">Decision Score</span>
                    <span className="si-val mono">{result.decision_score}</span>
                  </div>
                  <div className="score-item">
                    <span className="si-label">Label Code</span>
                    <span className="si-val mono" style={{ color: verdictColor }}>
                      {result.label_code === 1 ? "+1 (Genuine)" : "−1 (Anomaly)"}
                    </span>
                  </div>
                  <div className="score-item">
                    <span className="si-label">Timestamp</span>
                    <span className="si-val mono" style={{ fontSize: 11 }}>
                      {new Date(result.timestamp).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Anomaly scale bar */}
              <div className="scale-wrap">
                <div className="scale-labels">
                  <span style={{ color: "var(--ok)" }}>Genuine</span>
                  <span style={{ color: "var(--bad)" }}>Counterfeit</span>
                </div>
                <div className="scale-track">
                  <div className="scale-fill ok-fill" style={{ width: "50%" }} />
                  <div className="scale-fill bad-fill" style={{ width: "50%" }} />
                  <div className="scale-pointer" style={{
                    left: isGenuine
                      ? `${Math.round((1 - result.confidence) * 50)}%`
                      : `${Math.round(50 + result.confidence * 50)}%`,
                    background: verdictColor,
                  }} />
                </div>
                <div className="scale-mid-label">Decision boundary</div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* ── History Drawer ───────────────────────────────────────────── */}
      {histOpen && (
        <div className="drawer-bg" onClick={() => setHistOpen(false)}>
          <aside className="drawer" onClick={e => e.stopPropagation()}>
            <div className="drawer-head">
              <span><Icon name="clock" size={16} /> Scan History</span>
              <button onClick={() => setHistOpen(false)}><Icon name="x" size={20} /></button>
            </div>
            {history.length === 0
              ? <p className="no-hist">No scans yet.</p>
              : history.map(s => <HistRow key={s.scan_id} s={s} onDelete={delScan} />)}
          </aside>
        </div>
      )}
    </div>
  );
}
