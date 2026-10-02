/**
 * quality.js — Pure browser-side computer vision functions for frame & image quality assessment.
 * Unit testable without browser DOM dependencies (accepts ImageData-like objects: { data, width, height }).
 */

import { QUALITY_CONFIG } from "./qualityConfig";

/**
 * Computes mean luminance across pixels.
 * @param {{ data: Uint8ClampedArray | number[], width: number, height: number }} imageData
 * @returns {number} Mean brightness [0, 255]
 */
export function brightness(imageData) {
  const { data, width, height } = imageData;
  const n = width * height;
  if (n === 0) return 0;

  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    // Standard perceptual luminance: 0.299R + 0.587G + 0.114B
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return sum / n;
}

/**
 * Extracts 1D grayscale float array from RGBA image data.
 * @param {{ data: Uint8ClampedArray | number[], width: number, height: number }} imageData
 * @returns {Float32Array}
 */
export function toGrayscaleArray(imageData) {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);
  let j = 0;
  for (let i = 0; i < data.length; i += 4) {
    gray[j++] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return gray;
}

/**
 * Computes blur score as the variance of a 3x3 discrete Laplacian filter.
 * Standard discrete Laplacian kernel:
 *   [ 0,  1,  0 ]
 *   [ 1, -4,  1 ]
 *   [ 0,  1,  0 ]
 * @param {{ data: Uint8ClampedArray | number[], width: number, height: number }} imageData
 * @returns {number} Laplacian variance (higher = sharper, lower = blurrier)
 */
export function blurScore(imageData) {
  const { width, height } = imageData;
  if (width < 3 || height < 3) return 0;

  const gray = toGrayscaleArray(imageData);
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = rowOffset + x;
      // Discrete Laplacian: top + bottom + left + right - 4 * center
      const lap =
        gray[idx - width] +
        gray[idx + width] +
        gray[idx - 1] +
        gray[idx + 1] -
        4 * gray[idx];

      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return Math.max(0, variance);
}

/**
 * Computes fraction of near-saturated specular glare pixels (>250 on all channels).
 * @param {{ data: Uint8ClampedArray | number[], width: number, height: number }} imageData
 * @returns {number} Glare fraction [0, 1]
 */
export function glareFraction(imageData) {
  const { data, width, height } = imageData;
  const totalPixels = width * height;
  if (totalPixels === 0) return 0;

  let glareCount = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 250 && data[i + 1] > 250 && data[i + 2] > 250) {
      glareCount++;
    }
  }
  return glareCount / totalPixels;
}

/**
 * Computes motion score as mean absolute difference between two consecutive grayscale frames.
 * @param {Float32Array} prevGray
 * @param {Float32Array} curGray
 * @returns {number} Motion score (0 = static, >8 = moving)
 */
export function motionScore(prevGray, curGray) {
  if (!prevGray || !curGray || prevGray.length !== curGray.length || prevGray.length === 0) {
    return 0;
  }
  let sumDiff = 0;
  for (let i = 0; i < curGray.length; i++) {
    sumDiff += Math.abs(curGray[i] - prevGray[i]);
  }
  return sumDiff / curGray.length;
}

/**
 * Estimates how much of the frame or guide box is filled by the foreground tablet.
 * @param {{ data: Uint8ClampedArray | number[], width: number, height: number }} imageData
 * @returns {number} Fill ratio [0, 1]
 */
export function fillRatio(imageData) {
  const { width, height } = imageData;
  const gray = toGrayscaleArray(imageData);
  if (gray.length === 0) return 0;

  // Approximate background intensity using top and bottom border bands (10%)
  const borderHeight = Math.max(1, Math.floor(height * 0.1));
  let borderSum = 0;
  let borderCount = 0;

  for (let y = 0; y < borderHeight; y++) {
    for (let x = 0; x < width; x++) {
      borderSum += gray[y * width + x];
      borderCount++;
    }
  }
  for (let y = height - borderHeight; y < height; y++) {
    for (let x = 0; x < width; x++) {
      borderSum += gray[y * width + x];
      borderCount++;
    }
  }

  const bgAvg = borderCount > 0 ? borderSum / borderCount : 128;

  // Pixels differing by > 25 intensity levels belong to foreground tablet
  let fgCount = 0;
  for (let i = 0; i < gray.length; i++) {
    if (Math.abs(gray[i] - bgAvg) > 25) {
      fgCount++;
    }
  }
  return fgCount / gray.length;
}

/**
 * Full frame quality analysis with prioritized feedback and continuous scoring.
 * @param {{ data: Uint8ClampedArray | number[], width: number, height: number }} imageData
 * @param {Float32Array | null} prevGray
 * @returns {{
 *   ok: boolean,
 *   score: number,
 *   issue: string | null,
 *   severity: 'red' | 'amber' | 'green',
 *   metrics: { brightness: number, blur: number, glare: number, motion: number, fill: number },
 *   curGray: Float32Array
 * }}
 */
export function assessFrameQuality(imageData, prevGray = null) {
  const b = brightness(imageData);
  const blur = blurScore(imageData);
  const glare = glareFraction(imageData);
  const curGray = toGrayscaleArray(imageData);
  const motion = prevGray ? motionScore(prevGray, curGray) : 0;
  const fill = fillRatio(imageData);

  let issue = null;
  let severity = "green";

  // Prioritized checks:
  // 1. Dark -> 2. Glare -> 3. Blur -> 4. Fill -> 5. Motion -> Ready
  if (b < QUALITY_CONFIG.brightnessMin) {
    issue = b < 35 ? "Too dark — turn on light or move to brighter area" : "A bit dark — improve lighting";
    severity = b < 35 ? "red" : "amber";
  } else if (b > QUALITY_CONFIG.brightnessMax) {
    issue = "Too bright — reduce harsh direct light";
    severity = "amber";
  } else if (glare > QUALITY_CONFIG.glareMaxFraction) {
    issue = "Glare detected — tilt strip or adjust light angle";
    severity = "amber";
  } else if (blur < QUALITY_CONFIG.blurThreshold) {
    issue = "Blurry — hold camera steady to focus";
    severity = blur < 20 ? "red" : "amber";
  } else if (fill < QUALITY_CONFIG.fillMinRatio) {
    issue = "Move closer to frame the tablet";
    severity = "amber";
  } else if (fill > QUALITY_CONFIG.fillMaxRatio) {
    issue = "Move back slightly — tablet too close to edge";
    severity = "amber";
  } else if (motion > QUALITY_CONFIG.motionThreshold) {
    issue = "Hold steady...";
    severity = "amber";
  }

  const ok = issue === null;

  // Normalized score [0, 1]
  const bScore = 1.0 - Math.min(Math.abs(b - 140) / 120, 1.0);
  const blurScoreNorm = Math.min(blur / (QUALITY_CONFIG.blurThreshold * 2), 1.0);
  const glareScoreNorm = Math.max(0, 1.0 - glare / (QUALITY_CONFIG.glareMaxFraction * 2.5));
  const motionScoreNorm = Math.max(0, 1.0 - motion / (QUALITY_CONFIG.motionThreshold * 2));
  const score = Math.round((0.3 * bScore + 0.35 * blurScoreNorm + 0.2 * glareScoreNorm + 0.15 * motionScoreNorm) * 100) / 100;

  return {
    ok,
    score: Math.max(0, Math.min(1, score)),
    issue: issue || "Perfect, hold still",
    severity: ok ? "green" : severity,
    metrics: {
      brightness: Math.round(b * 10) / 10,
      blur: Math.round(blur * 10) / 10,
      glare: Math.round(glare * 1000) / 1000,
      motion: Math.round(motion * 10) / 10,
      fill: Math.round(fill * 100) / 100,
    },
    curGray,
  };
}
