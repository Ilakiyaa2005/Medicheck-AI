/**
 * qualityConfig.js — Shared quality assessment thresholds.
 * Mirrors backend/quality.py to ensure identical evaluation criteria in-browser and on-server.
 */

export const QUALITY_CONFIG = {
  brightnessMin: 60.0,
  brightnessMax: 215.0,
  blurThreshold: 45.0,        // Laplacian variance threshold on normalized analysis resolution
  glareMaxFraction: 0.04,     // > 4% saturated pixels (>250 in R, G, B)
  motionThreshold: 8.0,       // Mean absolute frame difference for motion detection
  fillMinRatio: 0.15,         // Tablet too far / small in guide ROI
  fillMaxRatio: 0.92,         // Tablet clipped or too close
  steadyDurationMs: 1300,     // Required duration of consecutive passing frames for auto-capture
  hysteresisFrames: 3,        // Number of consecutive frames needed to switch dominant advice
};
