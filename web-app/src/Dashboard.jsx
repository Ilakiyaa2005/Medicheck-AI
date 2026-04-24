import { useState, useEffect, useRef } from "react";
import "./Dashboard.css";

const API="https://medicheck-ai-njtm.onrender.com";
//const API = import.meta.env.VITE_API_URL;

/* ── Mini donut chart ────────────────────────────────────────────────────── */
function Donut({ genuine, fake }) {
  const total = genuine + fake || 1;
  const gpct  = (genuine / total) * 100;
  const fpct  = (fake    / total) * 100;
  const r = 52, circ = 2 * Math.PI * r;
  const gDash = circ * (gpct / 100);
  const fDash = circ * (fpct / 100);
  return (
    <div className="donut-wrap">
      <svg width="130" height="130" viewBox="0 0 130 130">
        {/* track */}
        <circle cx="65" cy="65" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="14"/>
        {/* genuine arc */}
        <circle cx="65" cy="65" r={r} fill="none" stroke="#00ff88" strokeWidth="14"
          strokeLinecap="butt"
          strokeDasharray={`${gDash} ${circ - gDash}`}
          transform="rotate(-90 65 65)"
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
        {/* fake arc */}
        <circle cx="65" cy="65" r={r} fill="none" stroke="#ff2d55" strokeWidth="14"
          strokeLinecap="butt"
          strokeDasharray={`${fDash} ${circ - fDash}`}
          strokeDashoffset={-gDash}
          transform="rotate(-90 65 65)"
          style={{ transition: "stroke-dasharray 1s ease, stroke-dashoffset 1s ease" }}
        />
        <text x="65" y="61" textAnchor="middle" fill="#e8f4ff" fontSize="20" fontWeight="700" fontFamily="monospace">{total}</text>
        <text x="65" y="75" textAnchor="middle" fill="rgba(205,232,245,0.4)" fontSize="9" fontFamily="monospace">TOTAL</text>
      </svg>
      <div className="donut-legend">
        <div className="dl-item"><span className="dl-dot" style={{background:"#00ff88"}}/>Genuine <b>{genuine}</b></div>
        <div className="dl-item"><span className="dl-dot" style={{background:"#ff2d55"}}/>Fake <b>{fake}</b></div>
      </div>
    </div>
  );
}

/* ── Bar chart for feature values ────────────────────────────────────────── */
function FeatureBar({ name, value, max, color }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="fbar-row">
      <span className="fbar-name">{name}</span>
      <div className="fbar-track">
        <div className="fbar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="fbar-val">{value.toFixed(2)}</span>
    </div>
  );
}

/* ── Trend sparkline ─────────────────────────────────────────────────────── */
function Sparkline({ data, color }) {
  const ref = useRef();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const min = Math.min(...data), max = Math.max(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => ({
      x: (i / (data.length - 1)) * W,
      y: H - ((v - min) / range) * H * 0.8 - H * 0.1,
    }));
    ctx.clearRect(0, 0, W, H);
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, color + "40");
    grad.addColorStop(1, color + "00");
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
  }, [data, color]);
  return <canvas ref={ref} width={200} height={50} className="sparkline" />;
}

/* ── Scan row ────────────────────────────────────────────────────────────── */
function ScanRow({ s, idx }) {
  const ok = s.result === "Genuine";
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`dash-scan-row ${ok ? "dsr-ok" : "dsr-bad"}`}>
      <div className="dsr-main" onClick={() => setExpanded(v => !v)}>
        <span className="dsr-idx">#{idx + 1}</span>
        <span className={`dsr-badge ${ok ? "db-ok" : "db-bad"}`}>{ok ? "✓ GENUINE" : "✗ FAKE"}</span>
        <span className="dsr-med">{s.medicine_name}</span>
        {s.batch_id && <span className="dsr-batch">{s.batch_id}</span>}
        <span className="dsr-conf">{Math.round(s.confidence * 100)}%</span>
        <span className="dsr-score mono">{s.anomaly_score ?? "—"}</span>
        <span className="dsr-time">{new Date(s.timestamp).toLocaleString()}</span>
        <span className="dsr-expand">{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && s.features && (
        <div className="dsr-features">
          <div className="dsr-feat-grid">
            {Object.entries(s.features).map(([k, v]) => (
              <div key={k} className="dsr-feat-chip">
                <span className="dfc-key">{k}</span>
                <span className="dfc-val">{Number(v).toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── MAIN DASHBOARD ──────────────────────────────────────────────────────── */
export default function Dashboard({ onBack }) {
  const [scans,    setScans]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState("all"); // all | genuine | fake
  const [search,   setSearch]   = useState("");
  const [sortBy,   setSortBy]   = useState("time"); // time | conf | score
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const r = await fetch(`${API}/history?limit=200`);
      const d = await r.json();
      setScans(d.scans || []);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, []);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const genuine = scans.filter(s => s.result === "Genuine");
  const fake    = scans.filter(s => s.result === "Fake");
  const avgConf = scans.length ? scans.reduce((a,s) => a + s.confidence, 0) / scans.length : 0;
  const avgScore = scans.length
    ? scans.reduce((a,s) => a + (s.anomaly_score ?? 0), 0) / scans.length
    : 0;

  // confidence trend (last 20)
  const confTrend = scans.slice(0, 20).map(s => s.confidence).reverse();
  const scoreTrend = scans.slice(0, 20).map(s => Math.abs(s.anomaly_score ?? 0)).reverse();

  // Average features across all scans with features
  const withFeats = scans.filter(s => s.features);
  const avgFeats  = {};
  if (withFeats.length) {
    Object.keys(withFeats[0].features || {}).forEach(k => {
      avgFeats[k] = withFeats.reduce((a,s) => a + (s.features[k]||0), 0) / withFeats.length;
    });
  }
  const featMax = Math.max(...Object.values(avgFeats));

  // Feature colour map
  const featColor = k => {
    if (k.includes("_R") || k.startsWith("R_")) return "#ff6b6b";
    if (k.includes("_G") || k.startsWith("G_")) return "#51cf66";
    if (k.includes("_B") || k.startsWith("B_")) return "#74c0fc";
    if (k.includes("_H")) return "#ffd43b";
    if (k.includes("_S")) return "#ff922b";
    return "#94d82d";
  };

  // ── Filtered / sorted list ─────────────────────────────────────────────────
  let shown = scans.filter(s => {
    if (filter === "genuine" && s.result !== "Genuine") return false;
    if (filter === "fake"    && s.result !== "Fake")    return false;
    if (search && !s.medicine_name.toLowerCase().includes(search.toLowerCase()) &&
        !(s.batch_id||"").toLowerCase().includes(search.toLowerCase()) &&
        !s.scan_id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  if (sortBy === "conf")  shown = [...shown].sort((a,b) => b.confidence - a.confidence);
  if (sortBy === "score") shown = [...shown].sort((a,b) => (a.anomaly_score||0) - (b.anomaly_score||0));

  // ── Rate ──────────────────────────────────────────────────────────────────
  const fakeRate = scans.length ? Math.round((fake.length / scans.length) * 100) : 0;

  return (
    <div className="dashboard">
      <div className="dash-scanlines" />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="dash-hdr">
        <div className="dash-hdr-left">
          <button className="back-btn" onClick={onBack}>← Back to Scanner</button>
          <div className="dash-title">
            <span className="dash-title-icon">📊</span>
            Analytics Dashboard
          </div>
        </div>
        <div className="dash-hdr-right">
          <button className={`refresh-btn ${refreshing ? "spinning" : ""}`} onClick={load}>↻ Refresh</button>
          <div className="dash-online">
            <div className="online-dot"/>
            <span>{scans.length} scans loaded</span>
          </div>
        </div>
      </header>

      <main className="dash-main">

        {loading ? (
          <div className="dash-loading">
            <div className="dash-spin"/><p>Loading scan history…</p>
          </div>
        ) : scans.length === 0 ? (
          <div className="dash-empty">
            <div style={{fontSize:48}}>📭</div>
            <h3>No Scans Yet</h3>
            <p>Go back to the scanner and analyse some tablets first.</p>
            <button className="back-btn" onClick={onBack}>Open Scanner</button>
          </div>
        ) : (
          <>
            {/* ── KPI row ─────────────────────────────────────────────────── */}
            <div className="kpi-row">
              <div className="kpi-card">
                <div className="kpi-icon" style={{color:"#00c8ff"}}>⬡</div>
                <div className="kpi-val">{scans.length}</div>
                <div className="kpi-label">Total Scans</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-icon" style={{color:"#00ff88"}}>✓</div>
                <div className="kpi-val" style={{color:"#00ff88"}}>{genuine.length}</div>
                <div className="kpi-label">Genuine</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-icon" style={{color:"#ff2d55"}}>✗</div>
                <div className="kpi-val" style={{color:"#ff2d55"}}>{fake.length}</div>
                <div className="kpi-label">Counterfeit</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-icon" style={{color:"#fb923c"}}>⚠</div>
                <div className="kpi-val" style={{color: fakeRate > 20 ? "#ff2d55" : "#fb923c"}}>{fakeRate}%</div>
                <div className="kpi-label">Fake Rate</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-icon" style={{color:"#a78bfa"}}>◎</div>
                <div className="kpi-val" style={{color:"#a78bfa"}}>{Math.round(avgConf*100)}%</div>
                <div className="kpi-label">Avg Confidence</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-icon" style={{color:"#00c8ff"}}>∿</div>
                <div className="kpi-val mono" style={{color:"#00c8ff", fontSize:18}}>{avgScore.toFixed(3)}</div>
                <div className="kpi-label">Avg Anomaly Score</div>
              </div>
            </div>

            {/* ── Charts row ──────────────────────────────────────────────── */}
            <div className="charts-row">

              {/* Donut */}
              <div className="chart-card">
                <div className="chart-title">Detection Breakdown</div>
                <Donut genuine={genuine.length} fake={fake.length} />
              </div>

              {/* Confidence trend */}
              <div className="chart-card">
                <div className="chart-title">Confidence Trend (last 20)</div>
                {confTrend.length >= 2
                  ? <Sparkline data={confTrend} color="#00c8ff" />
                  : <p className="no-data">Need 2+ scans</p>
                }
                <div className="spark-labels">
                  <span>Oldest</span><span>Latest</span>
                </div>
              </div>

              {/* Anomaly score trend */}
              <div className="chart-card">
                <div className="chart-title">Anomaly Score |Abs| Trend</div>
                {scoreTrend.length >= 2
                  ? <Sparkline data={scoreTrend} color="#ff2d55" />
                  : <p className="no-data">Need 2+ scans</p>
                }
                <div className="spark-labels">
                  <span>Oldest</span><span>Latest</span>
                </div>
              </div>

              {/* Genuine rate */}
              <div className="chart-card">
                <div className="chart-title">Authentication Rate</div>
                <div className="auth-rate-wrap">
                  <div className="auth-rate-bar">
                    <div className="arb-fill ok-fill" style={{ height: `${100 - fakeRate}%` }} />
                    <div className="arb-fill bad-fill" style={{ height: `${fakeRate}%` }} />
                  </div>
                  <div className="auth-rate-labels">
                    <span style={{color:"#00ff88"}}>{100 - fakeRate}% Genuine</span>
                    <span style={{color:"#ff2d55"}}>{fakeRate}% Fake</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Avg features chart ──────────────────────────────────────── */}
            {Object.keys(avgFeats).length > 0 && (
              <div className="dash-card">
                <div className="chart-title">Average Feature Values (across all scans)</div>
                <div className="feat-bars">
                  {Object.entries(avgFeats).map(([k, v]) => (
                    <FeatureBar key={k} name={k} value={v} max={featMax} color={featColor(k)} />
                  ))}
                </div>
              </div>
            )}

            {/* ── Alert: high fake rate ───────────────────────────────────── */}
            {fakeRate >= 30 && (
              <div className="dash-alert">
                ⚠️ High counterfeit rate detected ({fakeRate}%)! Consider reviewing your supply chain. {fake.length} out of {scans.length} scanned tablets flagged as suspicious.
              </div>
            )}

            {/* ── Scan table ──────────────────────────────────────────────── */}
            <div className="dash-card">
              <div className="table-header">
                <div className="chart-title">Scan Records</div>
                <div className="table-controls">
                  <input className="search-inp" placeholder="🔍 Search medicine, batch, ID…"
                    value={search} onChange={e => setSearch(e.target.value)} />
                  <select className="sort-sel" value={filter} onChange={e => setFilter(e.target.value)}>
                    <option value="all">All Results</option>
                    <option value="genuine">Genuine Only</option>
                    <option value="fake">Fake Only</option>
                  </select>
                  <select className="sort-sel" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                    <option value="time">Sort: Time</option>
                    <option value="conf">Sort: Confidence</option>
                    <option value="score">Sort: Anomaly Score</option>
                  </select>
                </div>
              </div>

              <div className="table-cols-hdr">
                <span>#</span><span>Result</span><span>Medicine</span><span>Batch</span>
                <span>Conf</span><span>Score</span><span>Time</span><span></span>
              </div>

              {shown.length === 0
                ? <p className="no-data center">No scans match this filter.</p>
                : shown.map((s, i) => <ScanRow key={s.scan_id} s={s} idx={i} />)
              }

              <div className="table-footer">
                Showing {shown.length} of {scans.length} scans
              </div>
            </div>

            {/* ── Export ──────────────────────────────────────────────────── */}
            <div className="export-row">
              <button className="export-btn" onClick={() => {
                const csv = [
                  "scan_id,medicine_name,batch_id,result,confidence,anomaly_score,decision_score,timestamp",
                  ...scans.map(s =>
                    `${s.scan_id},"${s.medicine_name}","${s.batch_id||""}",${s.result},${s.confidence},${s.anomaly_score||""},${s.decision_score||""},${s.timestamp}`
                  )
                ].join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `spectraauth_scans_${Date.now()}.csv`;
                a.click();
              }}>
                ⬇ Export Scan History as CSV
              </button>
              <div className="export-note">
                Exports {scans.length} scan records with all metadata.
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
