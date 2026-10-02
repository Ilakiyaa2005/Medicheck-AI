import React, { useState, useRef } from "react";
import { parseLabelText, parseGs1Barcode } from "../lib/labelParser";
import { parseExpiryDate, checkExpiryStatus } from "../lib/expiry";

/**
 * LabelScanner — Browser-side OCR & Barcode scanner for batch numbers and expiry dates.
 * Features:
 *   - Native BarcodeDetector with lazy-loaded @zxing/browser fallback for 1D/2D barcodes & GS1.
 *   - Lazy-loaded Tesseract.js in a Web Worker with pre-processing (upscale, contrast) and progress bar.
 *   - Candidate selection chips for high OCR reliability on difficult foil packaging.
 *   - Fast manual override inputs.
 *   - URL safety: raw barcodes containing URLs are rendered as text and never auto-opened.
 */
export default function LabelScanner({ onBatchSelected, onExpirySelected, onClose }) {
  const [activeTab, setActiveTab] = useState("ocr"); // 'ocr' | 'barcode' | 'manual'
  const [ocrProgress, setOcrProgress] = useState(null); // { status: string, progress: number }
  const [ocrCandidates, setOcrCandidates] = useState({ batches: [], expiries: [] });
  const [barcodeResult, setBarcodeResult] = useState(null);
  const [rawOcrText, setRawOcrText] = useState("");
  const [manualBatch, setManualBatch] = useState("");
  const [manualExpiry, setManualExpiry] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const fileInputRef = useRef(null);

  // ── Pre-process canvas for OCR (grayscale, upscale x2, contrast enhancement) ──
  const preprocessImageForOcr = async (file) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        // Upscale x2 for small printed text on blister packs
        const scale = 2.0;
        canvas.width = Math.min(2400, Math.floor(img.width * scale));
        canvas.height = Math.min(2400, Math.floor(img.height * scale));

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // High contrast grayscale filter
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          // Contrast stretch
          const contrastGray = Math.max(0, Math.min(255, (gray - 128) * 1.5 + 128));
          d[i] = contrastGray;
          d[i + 1] = contrastGray;
          d[i + 2] = contrastGray;
        }
        ctx.putImageData(imgData, 0, 0);

        canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
      };
      img.onerror = reject;
      img.src = url;
    });
  };

  // ── Run Tesseract OCR (Lazy-Loaded) ──
  const runOcrOnImage = async (file) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setOcrProgress({ status: "Preprocessing image...", progress: 0.1 });

    try {
      const processedBlob = await preprocessImageForOcr(file);

      setOcrProgress({ status: "Loading OCR engine...", progress: 0.25 });
      // Dynamic import
      const { createWorker } = await import("tesseract.js");

      const worker = await createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setOcrProgress({
              status: "Recognizing packaging text...",
              progress: 0.3 + m.progress * 0.65,
            });
          }
        },
      });

      const { data } = await worker.recognize(processedBlob);
      await worker.terminate();

      setRawOcrText(data.text);
      const parsed = parseLabelText(data.text);

      setOcrCandidates({
        batches: parsed.batchCandidates,
        expiries: parsed.expiryCandidates,
      });

      setOcrProgress(null);
      setIsProcessing(false);

      if (parsed.batchCandidates.length === 0 && parsed.expiryCandidates.length === 0) {
        setErrorMessage("No clear batch or expiry detected. Try adjusting lighting or use manual entry.");
      }
    } catch (err) {
      console.error("[OCR] Failed:", err);
      setIsProcessing(false);
      setOcrProgress(null);
      setErrorMessage("OCR processing failed on this device. Please enter details manually.");
    }
  };

  // ── Barcode / QR Scanner (Native BarcodeDetector with @zxing fallback) ──
  const runBarcodeScanOnImage = async (file) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setBarcodeResult(null);

    try {
      // 1. Try native BarcodeDetector if available
      if ("BarcodeDetector" in window) {
        try {
          const detector = new window.BarcodeDetector({
            formats: ["qr_code", "data_matrix", "code_128", "ean_13", "code_39"],
          });
          const img = new Image();
          const url = URL.createObjectURL(file);
          await new Promise((r) => { img.onload = r; img.src = url; });
          URL.revokeObjectURL(url);

          const barcodes = await detector.detect(img);
          if (barcodes.length > 0) {
            handleBarcodeRaw(barcodes[0].rawValue);
            setIsProcessing(false);
            return;
          }
        } catch (e) {
          console.warn("[Barcode] Native detector failed, falling back to @zxing:", e);
        }
      }

      // 2. Fallback to @zxing/browser
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const url = URL.createObjectURL(file);
      const result = await reader.decodeFromImageUrl(url);
      URL.revokeObjectURL(url);

      if (result) {
        handleBarcodeRaw(result.getText());
      } else {
        setErrorMessage("No 1D barcode or 2D DataMatrix code detected in image.");
      }
    } catch (err) {
      console.warn("[Barcode] ZXing scan error:", err);
      setErrorMessage("No readable barcode detected. Please ensure the code is well-lit and in focus.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBarcodeRaw = (raw) => {
    const gs1 = parseGs1Barcode(raw);
    setBarcodeResult({
      raw,
      isUrl: /^https?:\/\//i.test(raw),
      ...gs1,
    });

    if (gs1.batchId && onBatchSelected) {
      onBatchSelected(gs1.batchId);
    }
    if (gs1.expiryDate && onExpirySelected) {
      onExpirySelected(gs1.expiryDate);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (activeTab === "ocr") {
      runOcrOnImage(file);
    } else {
      runBarcodeScanOnImage(file);
    }
  };

  const handleManualApply = () => {
    if (manualBatch.trim() && onBatchSelected) {
      onBatchSelected(manualBatch.trim());
    }
    if (manualExpiry.trim() && onExpirySelected) {
      const parsed = parseExpiryDate(manualExpiry.trim());
      onExpirySelected(parsed.display || manualExpiry.trim());
    }
    if (onClose) onClose();
  };

  return (
    <div className="label-scanner-card" style={{ padding: "1.25rem", background: "#0d1424", border: "1px solid rgba(0,255,136,0.2)", borderRadius: "12px", marginTop: "1rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.2rem" }}>🏷️</span>
          <span style={{ fontWeight: 700, color: "#e8f4ff", fontSize: "1rem" }}>
            Scan Batch ID & Expiry Date
          </span>
        </div>
        {onClose && (
          <button type="button" className="close-mini-btn" onClick={onClose} style={{ background: "transparent", border: "none", color: "#cde8f5", cursor: "pointer", fontSize: "1.1rem" }}>
            ✕
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="scanner-tabs" style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button
          type="button"
          className={`scanner-tab-btn ${activeTab === "ocr" ? "active" : ""}`}
          onClick={() => setActiveTab("ocr")}
        >
          📷 Scan Printed Label (OCR)
        </button>
        <button
          type="button"
          className={`scanner-tab-btn ${activeTab === "barcode" ? "active" : ""}`}
          onClick={() => setActiveTab("barcode")}
        >
          🏁 QR / DataMatrix
        </button>
        <button
          type="button"
          className={`scanner-tab-btn ${activeTab === "manual" ? "active" : ""}`}
          onClick={() => setActiveTab("manual")}
        >
          ✍️ Manual Entry
        </button>
      </div>

      {/* Tab 1: OCR */}
      {activeTab === "ocr" && (
        <div>
          <div style={{ fontSize: "0.84rem", color: "rgba(205,232,245,0.7)", marginBottom: "0.75rem" }}>
            Take a sharp close-up photo of the printed text on the medicine strip (showing <b>B.No.</b> and <b>EXP</b>).
          </div>

          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={handleFileChange}
          />

          <button
            type="button"
            className="btn btn-outline"
            style={{ width: "100%", padding: "0.75rem", borderColor: "#00ff88", color: "#00ff88" }}
            disabled={isProcessing}
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
          >
            {isProcessing ? "Processing OCR..." : "📸 Take or Upload Label Photo"}
          </button>

          {/* Progress Bar */}
          {ocrProgress && (
            <div style={{ marginTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "#cde8f5", marginBottom: "0.3rem" }}>
                <span>{ocrProgress.status}</span>
                <span>{Math.round(ocrProgress.progress * 100)}%</span>
              </div>
              <div style={{ width: "100%", height: "6px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{ width: `${ocrProgress.progress * 100}%`, height: "100%", background: "#00ff88", transition: "width 0.3s" }} />
              </div>
            </div>
          )}

          {/* Candidate Chips */}
          {ocrCandidates.batches.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <div style={{ fontSize: "0.8rem", color: "rgba(205,232,245,0.6)", marginBottom: "0.4rem" }}>
                Detected Batch Candidates (Tap to select):
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {ocrCandidates.batches.map((b, i) => (
                  <button
                    key={i}
                    type="button"
                    className="candidate-chip"
                    onClick={() => {
                      if (onBatchSelected) onBatchSelected(b.value);
                    }}
                  >
                    <b>{b.value}</b> ({Math.round(b.confidence * 100)}%)
                  </button>
                ))}
              </div>
            </div>
          )}

          {ocrCandidates.expiries.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <div style={{ fontSize: "0.8rem", color: "rgba(205,232,245,0.6)", marginBottom: "0.4rem" }}>
                Detected Expiry Dates (Tap to select):
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {ocrCandidates.expiries.map((e, i) => (
                  <button
                    key={i}
                    type="button"
                    className="candidate-chip exp"
                    onClick={() => {
                      if (onExpirySelected) onExpirySelected(e.value);
                    }}
                  >
                    📅 <b>{e.value}</b> ({Math.round(e.confidence * 100)}%)
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Barcode / QR */}
      {activeTab === "barcode" && (
        <div>
          <div style={{ fontSize: "0.84rem", color: "rgba(205,232,245,0.7)", marginBottom: "0.75rem" }}>
            Scan the 2D DataMatrix or QR code printed on the blister foil packaging.
          </div>

          <input
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            id="barcode-input-field"
            onChange={handleFileChange}
          />

          <button
            type="button"
            className="btn btn-outline"
            style={{ width: "100%", padding: "0.75rem", borderColor: "#74c0fc", color: "#74c0fc" }}
            disabled={isProcessing}
            onClick={() => {
              const el = document.getElementById("barcode-input-field");
              if (el) el.click();
            }}
          >
            {isProcessing ? "Scanning Code..." : "📷 Photograph 2D Code / Barcode"}
          </button>

          {barcodeResult && (
            <div className="barcode-result-card" style={{ marginTop: "1rem", padding: "0.75rem", background: "rgba(255,255,255,0.04)", borderRadius: "8px" }}>
              {barcodeResult.isUrl ? (
                <div>
                  <div style={{ fontSize: "0.78rem", color: "#ffd43b", fontWeight: 600 }}>
                    ⚠️ Scanned Link (URL not auto-opened for security):
                  </div>
                  <code style={{ fontSize: "0.8rem", color: "#e8f4ff", wordBreak: "break-all" }}>
                    {barcodeResult.raw}
                  </code>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {barcodeResult.batchId && (
                    <div style={{ color: "#00ff88", fontSize: "0.9rem" }}>
                      Batch: <b>{barcodeResult.batchId}</b>
                    </div>
                  )}
                  {barcodeResult.expiryDate && (
                    <div style={{ color: "#74c0fc", fontSize: "0.9rem" }}>
                      Expiry: <b>{barcodeResult.expiryDate}</b>
                    </div>
                  )}
                  {barcodeResult.gtin && (
                    <div style={{ color: "rgba(205,232,245,0.6)", fontSize: "0.8rem" }}>
                      GTIN: {barcodeResult.gtin}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Fast Manual Entry */}
      {activeTab === "manual" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "#cde8f5", marginBottom: "0.3rem" }}>
              Batch Number / Lot No:
            </label>
            <input
              type="text"
              className="text-input"
              style={{ width: "100%", padding: "0.5rem 0.75rem", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", color: "#fff" }}
              placeholder="e.g. INP24CT69 or XEB0005"
              value={manualBatch}
              onChange={(e) => setManualBatch(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "#cde8f5", marginBottom: "0.3rem" }}>
              Expiry Date (MM/YYYY or YYYY-MM):
            </label>
            <input
              type="text"
              className="text-input"
              style={{ width: "100%", padding: "0.5rem 0.75rem", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", color: "#fff" }}
              placeholder="e.g. 08/2027 or AUG 2027"
              value={manualExpiry}
              onChange={(e) => setManualExpiry(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: "0.5rem", padding: "0.6rem" }}
            onClick={handleManualApply}
          >
            Apply Details
          </button>
        </div>
      )}

      {errorMessage && (
        <div style={{ marginTop: "0.75rem", fontSize: "0.82rem", color: "#ffd43b" }}>
          ℹ️ {errorMessage}
        </div>
      )}
    </div>
  );
}
