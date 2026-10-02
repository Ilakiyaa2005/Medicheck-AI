import React, { useState } from "react";
import CameraModule from "./CameraModule";

/**
 * MultiShotModule — Guided multi-shot acquisition stepper (Accurate Scan mode).
 * Directs user through:
 *   - Shot 1: Ambient light (Flash OFF, top angle)
 *   - Shot 2: Diffuse / Torch illumination (Flash ON, top angle)
 *   - Shot 3 (Optional): Reverse side (Flash OFF, tablet flipped bottom angle)
 *
 * Each slot provides independent thumbnail review, quality feedback, and retake controls.
 */
export default function MultiShotModule({
  medicineName,
  batchId,
  onSubmitMulti,
  isSubmitting,
}) {
  const [shots, setShots] = useState([
    {
      id: 1,
      name: "Shot 1: Flash OFF",
      desc: "Standard ambient lighting, top side of tablet",
      shot_type: "flash_off",
      angle: "top",
      file: null,
      previewUrl: null,
    },
    {
      id: 2,
      name: "Shot 2: Flash ON",
      desc: "Flash or torch enabled (captures specular highlights)",
      shot_type: "flash_on",
      angle: "top",
      file: null,
      previewUrl: null,
    },
    {
      id: 3,
      name: "Shot 3: Tablet Flipped",
      desc: "Optional: Reverse side of tablet (ambient light)",
      shot_type: "flash_off",
      angle: "bottom",
      file: null,
      previewUrl: null,
      optional: true,
    },
  ]);

  const [activeCameraSlot, setActiveCameraSlot] = useState(null);

  const handleSlotFile = (slotId, file, actualShotType) => {
    const previewUrl = URL.createObjectURL(file);
    setShots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? {
              ...s,
              file,
              previewUrl,
              shot_type: actualShotType || s.shot_type,
            }
          : s
      )
    );
  };

  const handleClearSlot = (slotId) => {
    setShots((prev) =>
      prev.map((s) => {
        if (s.id === slotId) {
          if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
          return { ...s, file: null, previewUrl: null };
        }
        return s;
      })
    );
  };

  const filledCount = shots.filter((s) => s.file !== null).length;
  const canSubmit = filledCount >= 2 && !isSubmitting;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const activeShots = shots.filter((s) => s.file !== null);
    onSubmitMulti(activeShots);
  };

  return (
    <div className="multishot-container" style={{ marginTop: "1rem" }}>
      <div className="multishot-header" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.2rem" }}>🎯</span>
          <span style={{ fontWeight: 700, color: "#e8f4ff", fontSize: "1.05rem" }}>
            Accurate Multi-Angle Scan ({filledCount}/3 Captured)
          </span>
        </div>
        <p style={{ fontSize: "0.82rem", color: "rgba(205,232,245,0.7)", margin: "0.3rem 0 0" }}>
          Analyzing 2 to 3 photos under different illumination conditions dramatically enhances detection precision.
        </p>
      </div>

      {/* Slots Grid */}
      <div className="multishot-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
        {shots.map((slot) => (
          <div
            key={slot.id}
            className={`multishot-slot-card ${slot.file ? "has-file" : ""}`}
            style={{
              background: "#0d1424",
              border: slot.file ? "1px solid #00ff88" : "1px dashed rgba(255,255,255,0.15)",
              borderRadius: "10px",
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                <span style={{ fontWeight: 600, color: "#fff", fontSize: "0.92rem" }}>
                  {slot.name}
                </span>
                {slot.optional && (
                  <span style={{ fontSize: "0.7rem", color: "#74c0fc", background: "rgba(116,192,252,0.1)", padding: "2px 6px", borderRadius: "4px" }}>
                    Optional
                  </span>
                )}
              </div>
              <div style={{ fontSize: "0.78rem", color: "rgba(205,232,245,0.6)", marginBottom: "0.75rem", minHeight: "2.4em" }}>
                {slot.desc}
              </div>

              {/* Thumbnail preview if captured */}
              {slot.previewUrl ? (
                <div style={{ position: "relative", marginBottom: "0.75rem", borderRadius: "8px", overflow: "hidden", height: "130px", background: "#000" }}>
                  <img
                    src={slot.previewUrl}
                    alt={slot.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <div style={{ position: "absolute", bottom: "6px", left: "6px", background: "rgba(0,0,0,0.7)", padding: "2px 6px", borderRadius: "4px", fontSize: "0.72rem", color: "#00ff88" }}>
                    ✓ Ready
                  </div>
                </div>
              ) : (
                <div style={{ height: "130px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.02)", borderRadius: "8px", marginBottom: "0.75rem", color: "rgba(205,232,245,0.3)", fontSize: "0.85rem" }}>
                  Awaiting photo
                </div>
              )}
            </div>

            {/* Actions for this slot */}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {slot.file ? (
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ width: "100%", fontSize: "0.8rem", padding: "0.4rem" }}
                  onClick={() => handleClearSlot(slot.id)}
                >
                  🔄 Retake
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ flex: 1, fontSize: "0.8rem", padding: "0.45rem" }}
                    onClick={() => setActiveCameraSlot(slot)}
                  >
                    📷 Camera
                  </button>
                  <label
                    className="btn btn-outline"
                    style={{ flex: 1, fontSize: "0.8rem", padding: "0.45rem", textAlign: "center", cursor: "pointer" }}
                  >
                    📁 Upload
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files && e.target.files[0];
                        if (f) handleSlotFile(slot.id, f, slot.shot_type);
                      }}
                    />
                  </label>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Submit Multi-Shot Analysis Button */}
      <div style={{ marginTop: "1.25rem", textAlign: "center" }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: "0.85rem 2rem", fontSize: "1rem", opacity: canSubmit ? 1 : 0.5 }}
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {isSubmitting ? "Running Combined Multi-Shot Inference..." : `🚀 Run Multi-Shot Analysis (${filledCount} shots)`}
        </button>
        {filledCount < 2 && (
          <div style={{ fontSize: "0.8rem", color: "#ffd43b", marginTop: "0.5rem" }}>
            * Please capture at least 2 shots (Flash OFF and Flash ON) to proceed.
          </div>
        )}
      </div>

      {/* Camera Modal Overlay */}
      {activeCameraSlot && (
        <CameraModule
          activeShotType={activeCameraSlot.shot_type}
          onCapture={(file, actualShotType) => {
            handleSlotFile(activeCameraSlot.id, file, actualShotType);
            setActiveCameraSlot(null);
          }}
          onClose={() => setActiveCameraSlot(null)}
        />
      )}
    </div>
  );
}
