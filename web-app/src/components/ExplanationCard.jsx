import React, { useState } from "react";

/**
 * ExplanationCard — Renders explainable AI diagnosis for tablet authentication verdicts.
 * Features:
 *   - Top 3 diagnostic reasons in plain English.
 *   - Diverging horizontal bar chart of all 17 features centered at 0 (genuine mean).
 *   - Normal range band (p5 - p95) and status color coding (green/amber/red).
 *   - Accessible numerical readouts for screen readers and high contrast.
 *   - Transparent medical screening disclaimer.
 */
export default function ExplanationCard({ explanation, isGenuine }) {
  const [activeGroup, setActiveGroup] = useState("all");

  const features = explanation?.features || explanation?.feature_deviations || [];
  if (!explanation || features.length === 0) {
    return null;
  }

  const top_reasons = explanation.top_reasons || [];
  const note = explanation.note || "";
  const matchedMed = explanation.matched_medicine || "";

  const groups = ["all", "RGB", "Ratios", "HSV", "Intensity", "Texture", "Optical"];
  const filteredFeatures =
    activeGroup === "all" ? features : features.filter((f) => f.group === activeGroup);

  const getStatusColor = (status) => {
    switch (status) {
      case "normal":
        return "#00ff88"; // Neon green
      case "borderline":
        return "#ffd43b"; // Amber
      case "abnormal":
        return "#ff2d55"; // Red / Pink
      default:
        return "#74c0fc";
    }
  };

  return (
    <div className="explanation-card" style={{ marginTop: "1.5rem" }}>
      <div className="expl-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.2rem" }}>🔬</span>
          <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#e8f4ff", fontWeight: 700 }}>
            Explainable AI Diagnostics
          </h3>
        </div>
        <span className="expl-badge">XAI Screen</span>
      </div>

      {/* Baseline Reference Context */}
      {note && (
        <div style={{ fontSize: "0.82rem", color: "#74c0fc", marginTop: "0.5rem", background: "rgba(116, 192, 252, 0.08)", padding: "0.4rem 0.75rem", borderRadius: "6px", border: "1px solid rgba(116, 192, 252, 0.2)" }}>
          🎯 <b>Baseline:</b> {note}
        </div>
      )}

      {/* Top 3 Diagnostic Reasons */}
      <div className="expl-top-reasons" style={{ marginTop: "1rem" }}>
        {top_reasons.length > 0 && !isGenuine ? (
          <div>
            <div style={{ fontSize: "0.82rem", color: "rgba(205,232,245,0.7)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Key Deviation Factors
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {top_reasons.map((r, i) => (
                <div key={i} className="reason-item" style={{ borderLeft: `3px solid ${getStatusColor(r.status || "abnormal")}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontWeight: 600, color: "#fff", fontSize: "0.92rem" }}>
                      {r.label || r.feature}
                    </span>
                    <span style={{ fontSize: "0.8rem", color: getStatusColor(r.status || "abnormal"), fontFamily: "monospace" }}>
                      {r.z > 0 ? `+${r.z}σ` : `${r.z}σ`}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.83rem", color: "rgba(220,235,250,0.85)", marginTop: "0.2rem" }}>
                    {r.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="genuine-expl-banner" style={{ background: "rgba(0, 255, 136, 0.08)", border: "1px solid rgba(0, 255, 136, 0.25)", padding: "0.75rem 1rem", borderRadius: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#00ff88", fontWeight: 600, fontSize: "0.95rem" }}>
              <span>✓</span> All key spectral features are within the expected genuine range.
            </div>
            {top_reasons.length > 0 && (
              <div style={{ fontSize: "0.82rem", color: "rgba(205,232,245,0.7)", marginTop: "0.35rem" }}>
                Most borderline feature: <b>{top_reasons[0].label || top_reasons[0].feature}</b> ({top_reasons[0].z > 0 ? `+${top_reasons[0].z}σ` : `${top_reasons[0].z}σ`}) — {top_reasons[0].text}.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Diverging Bar Chart Title & Filter Tabs */}
      <div style={{ marginTop: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "#cde8f5" }}>
            Feature Deviation Spectrum (Clamped to ±4σ)
          </div>
          <div className="group-tabs" style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
            {groups.map((g) => (
              <button
                key={g}
                type="button"
                className={`group-tab-btn ${activeGroup === g ? "active" : ""}`}
                onClick={() => setActiveGroup(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Diverging Bar Chart Header Axis */}
        <div className="diverging-axis-header">
          <span>-4σ (Deficient)</span>
          <span style={{ color: "#00ff88" }}>0 (Reference Mean)</span>
          <span>+4σ (Elevated)</span>
        </div>

        {/* Diverging Bar Rows */}
        <div className="diverging-chart-rows" style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
          {filteredFeatures.map((f) => {
            const z = Math.max(-4, Math.min(4, f.z || 0));
            // Center is 50%
            const isNegative = z < 0;
            const barWidthPct = (Math.abs(z) / 4) * 50; // max 50% width from center
            const color = getStatusColor(f.status);

            return (
              <div key={f.name} className="diverging-row">
                <div className="d-label" title={`${f.name} (${f.group}): value=${f.value}, ref mean=${f.genuine_mean}`}>
                  <span className="d-name">{f.label || f.name}</span>
                  <span className="d-val">{f.value}</span>
                </div>

                <div className="d-track-wrap">
                  {/* Shaded band for reference normal range (-1.65 to +1.65 sigma = p5 to p95) */}
                  <div
                    className="d-normal-band"
                    style={{
                      left: `${50 - (1.65 / 4) * 50}%`,
                      width: `${(3.3 / 4) * 50}%`,
                    }}
                    title="Normal reference range (p5 - p95)"
                  />

                  {/* Center vertical reference line */}
                  <div className="d-center-line" />

                  {/* Diverging Bar */}
                  {isNegative ? (
                    <div
                      className="d-bar"
                      style={{
                        right: "50%",
                        width: `${barWidthPct}%`,
                        background: color,
                        borderTopLeftRadius: "3px",
                        borderBottomLeftRadius: "3px",
                      }}
                    />
                  ) : (
                    <div
                      className="d-bar"
                      style={{
                        left: "50%",
                        width: `${barWidthPct}%`,
                        background: color,
                        borderTopRightRadius: "3px",
                        borderBottomRightRadius: "3px",
                      }}
                    />
                  )}
                </div>

                <div className="d-z-badge" style={{ color }}>
                  {z > 0 ? `+${z}σ` : `${z}σ`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Honest Scientific Disclaimer */}
      <div className="expl-disclaimer" style={{ marginTop: "1.25rem", padding: "0.75rem", background: "rgba(255,255,255,0.03)", borderRadius: "6px", fontSize: "0.78rem", color: "rgba(205,232,245,0.6)", lineHeight: "1.4" }}>
        ⚠️ <b>Note:</b> Compared against genuine reference tablets under controlled optical parameters. This system operates as a computational screening aid and does not constitute a certified pharmaceutical chemical assay.
      </div>
    </div>
  );
}
