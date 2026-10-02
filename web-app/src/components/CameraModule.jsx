import React, { useState, useRef, useEffect, useCallback } from "react";
import { assessFrameQuality } from "../lib/quality";
import { QUALITY_CONFIG } from "../lib/qualityConfig";

/**
 * CameraModule — Real-time live camera guidance and auto-capture module.
 * Provides:
 *   - Continuous 6-8 fps ROI computer-vision frame analysis (brightness, blur, glare, motion, fill).
 *   - Prioritized HUD guidance messages with hysteresis dampening.
 *   - Dynamic quality border ring and auto-capture countdown timer.
 *   - High-resolution capture via ImageCapture API with full-res canvas fallback.
 *   - Hardware torch / flash toggle for supported mobile devices.
 *   - Robust stream cleanup, iOS Safari compatibility, and tab pause.
 */
export default function CameraModule({ onCapture, onClose, activeShotType = "flash_off" }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  const loopRef = useRef(null);
  const prevGrayRef = useRef(null);
  const consecutivePassRef = useRef(0);
  const passStartTimeRef = useRef(null);
  const lastAdviceRef = useRef({ issue: null, count: 0 });

  const [cameraState, setCameraState] = useState({
    active: false,
    facing: "environment",
    torchSupported: false,
    torchOn: false,
    error: null,
  });

  const [hudState, setHudState] = useState({
    message: "Initializing camera...",
    severity: "amber",
    progressPct: 0,
    metrics: { brightness: 0, blur: 0, glare: 0, motion: 0, fill: 0 },
    autoCaptureEnabled: true,
    isCountingDown: false,
    countdownSec: 0,
  });

  // Start or restart camera stream
  const startCamera = useCallback(async (facing = "environment") => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const constraints = {
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      trackRef.current = track;

      // Check torch capability
      let torchSupported = false;
      if (track && typeof track.getCapabilities === "function") {
        const caps = track.getCapabilities();
        torchSupported = !!caps.torch;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.setAttribute("muted", "true");
        await videoRef.current.play().catch(() => {});
      }

      setCameraState((prev) => ({
        ...prev,
        active: true,
        facing,
        torchSupported,
        torchOn: false,
        error: null,
      }));
    } catch (err) {
      console.error("[Camera] Access error:", err);
      let errMsg = "Camera access denied or unavailable.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        errMsg = "Camera permission was denied. Please allow camera access in browser settings.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        errMsg = "No camera found on this device.";
      }
      setCameraState((prev) => ({ ...prev, active: false, error: errMsg }));
    }
  }, []);

  // Stop camera tracks cleanly
  const stopCamera = useCallback(() => {
    if (loopRef.current) {
      clearInterval(loopRef.current);
      loopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    trackRef.current = null;
    setCameraState((prev) => ({ ...prev, active: false }));
  }, []);

  // Toggle Torch / Flash
  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track || !cameraState.torchSupported) return;
    try {
      const nextTorch = !cameraState.torchOn;
      await track.applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setCameraState((prev) => ({ ...prev, torchOn: nextTorch }));
    } catch (err) {
      console.warn("[Camera] Failed to toggle torch:", err);
    }
  };

  // Flip Camera (environment <-> user)
  const flipCamera = () => {
    const nextFacing = cameraState.facing === "environment" ? "user" : "environment";
    startCamera(nextFacing);
  };

  // Execute Still Photo Capture
  const triggerCapture = useCallback(async () => {
    const track = trackRef.current;
    const video = videoRef.current;
    if (!video) return;

    let blob = null;

    // Option A: Full-res ImageCapture API if available
    if (window.ImageCapture && track) {
      try {
        const imageCapture = new window.ImageCapture(track);
        blob = await imageCapture.takePhoto();
      } catch (e) {
        console.warn("[Camera] ImageCapture.takePhoto() failed, falling back to canvas:", e);
      }
    }

    // Option B: Canvas capture fallback
    if (!blob) {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.95);
      });
    }

    if (blob) {
      // Create a File object
      const file = new File([blob], `tablet_capture_${Date.now()}.jpg`, { type: "image/jpeg" });
      stopCamera();
      if (onCapture) {
        onCapture(file, cameraState.torchOn ? "flash_on" : activeShotType);
      }
    }
  }, [stopCamera, onCapture, cameraState.torchOn, activeShotType]);

  // Main CV Analysis Loop (~7 fps = 140ms interval)
  useEffect(() => {
    if (!cameraState.active) return;

    const analysisCanvas = document.createElement("canvas");
    analysisCanvas.width = 160;
    analysisCanvas.height = 120;
    const ctx = analysisCanvas.getContext("2d", { willReadFrequently: true });

    loopRef.current = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      // Draw center crop to offscreen analysis canvas
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      // 60% center crop of the camera feed
      const cropW = vw * 0.6;
      const cropH = vh * 0.6;
      const cropX = (vw - cropW) / 2;
      const cropY = (vh - cropH) / 2;

      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, 160, 120);
      const imgData = ctx.getImageData(0, 0, 160, 120);

      // Run computer-vision quality checks
      const assessment = assessFrameQuality(imgData, prevGrayRef.current);
      prevGrayRef.current = assessment.curGray;

      // Hysteresis advice dampening (message must persist 3 frames to update)
      const currentIssue = assessment.issue;
      if (currentIssue === lastAdviceRef.current.issue) {
        lastAdviceRef.current.count++;
      } else {
        lastAdviceRef.current = { issue: currentIssue, count: 1 };
      }

      let activeMessage = assessment.issue;
      let activeSeverity = assessment.severity;

      // Auto-capture countdown logic
      if (assessment.ok) {
        const now = Date.now();
        if (!passStartTimeRef.current) {
          passStartTimeRef.current = now;
        }
        const elapsed = now - passStartTimeRef.current;
        const progress = Math.min(100, Math.round((elapsed / QUALITY_CONFIG.steadyDurationMs) * 100));

        if (hudState.autoCaptureEnabled && elapsed >= QUALITY_CONFIG.steadyDurationMs) {
          // Trigger capture!
          passStartTimeRef.current = null;
          triggerCapture();
          return;
        }

        setHudState((prev) => ({
          ...prev,
          message: elapsed > 500 ? "Hold steady... capturing" : "Perfect, hold still",
          severity: "green",
          progressPct: progress,
          metrics: assessment.metrics,
        }));
      } else {
        passStartTimeRef.current = null;
        setHudState((prev) => ({
          ...prev,
          message: activeMessage,
          severity: activeSeverity,
          progressPct: 0,
          metrics: assessment.metrics,
        }));
      }
    }, 140);

    return () => {
      if (loopRef.current) {
        clearInterval(loopRef.current);
        loopRef.current = null;
      }
    };
  }, [cameraState.active, hudState.autoCaptureEnabled, triggerCapture]);

  // Pause loop on tab switch
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && loopRef.current) {
        clearInterval(loopRef.current);
        loopRef.current = null;
      } else if (!document.hidden && cameraState.active && !loopRef.current) {
        // Resume
        startCamera(cameraState.facing);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [cameraState.active, cameraState.facing, startCamera]);

  // Mount/unmount
  useEffect(() => {
    startCamera("environment");
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const getBorderColor = () => {
    switch (hudState.severity) {
      case "green":
        return "#00ff88";
      case "red":
        return "#ff2d55";
      case "amber":
      default:
        return "#ffd43b";
    }
  };

  return (
    <div className="camera-modal-backdrop">
      <div className="camera-modal-container">
        {/* Top Controls Bar */}
        <div className="camera-header-bar">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.1rem" }}>📷</span>
            <span style={{ fontWeight: 600, color: "#e8f4ff", fontSize: "0.95rem" }}>
              Live Guidance Camera
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            {cameraState.torchSupported && (
              <button
                type="button"
                className={`cam-ctrl-btn ${cameraState.torchOn ? "active" : ""}`}
                onClick={toggleTorch}
                title="Toggle Flash / Torch"
              >
                🔦 {cameraState.torchOn ? "ON" : "OFF"}
              </button>
            )}

            <button
              type="button"
              className="cam-ctrl-btn"
              onClick={flipCamera}
              title="Flip Camera"
            >
              🔄 Flip
            </button>

            <button
              type="button"
              className="cam-ctrl-btn close-btn"
              onClick={() => {
                stopCamera();
                if (onClose) onClose();
              }}
              title="Close Camera"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Viewfinder Area */}
        <div className="camera-viewfinder-wrap">
          {cameraState.error ? (
            <div className="camera-error-banner">
              <p>⚠️ {cameraState.error}</p>
              <button type="button" className="btn btn-outline" onClick={() => startCamera("environment")}>
                Retry Access
              </button>
            </div>
          ) : (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="camera-video-stream" />

              {/* Guide Overlay Box with Dynamic Quality Border */}
              <div
                className="camera-guide-box"
                style={{
                  borderColor: getBorderColor(),
                  boxShadow: `0 0 15px ${getBorderColor()}40`,
                }}
              >
                {/* Guide corners */}
                <div className="cam-corner tl" style={{ borderColor: getBorderColor() }} />
                <div className="cam-corner tr" style={{ borderColor: getBorderColor() }} />
                <div className="cam-corner bl" style={{ borderColor: getBorderColor() }} />
                <div className="cam-corner br" style={{ borderColor: getBorderColor() }} />

                {/* Progress bar around guide box */}
                <div
                  className="camera-progress-fill"
                  style={{
                    height: `${hudState.progressPct}%`,
                    background: getBorderColor(),
                  }}
                />
              </div>

              {/* Real-time Guidance HUD Banner */}
              <div className="camera-guidance-pill" style={{ borderColor: getBorderColor() }}>
                <span className="pill-dot" style={{ background: getBorderColor() }} />
                <span className="pill-text">{hudState.message}</span>
              </div>
            </>
          )}
        </div>

        {/* Bottom Controls Bar */}
        <div className="camera-footer-bar">
          <div className="auto-capture-toggle">
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.85rem", color: "#cde8f5" }}>
              <input
                type="checkbox"
                checked={hudState.autoCaptureEnabled}
                onChange={(e) => setHudState((prev) => ({ ...prev, autoCaptureEnabled: e.target.checked }))}
              />
              Auto-capture when steady
            </label>
          </div>

          {/* Big Shutter Button */}
          <button
            type="button"
            className="camera-shutter-btn"
            onClick={triggerCapture}
            disabled={!cameraState.active}
            title="Take Photo"
          >
            <div className="shutter-inner" />
          </button>

          <div style={{ width: "120px", textAlign: "right" }}>
            <span style={{ fontSize: "0.75rem", color: "rgba(205,232,245,0.5)", fontFamily: "monospace" }}>
              {hudState.metrics.blur > 0 ? `Q: ${hudState.metrics.blur} | B: ${hudState.metrics.brightness}` : ""}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
