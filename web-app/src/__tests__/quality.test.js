import { describe, it, expect } from "vitest";
import {
  brightness,
  toGrayscaleArray,
  blurScore,
  glareFraction,
  motionScore,
  fillRatio,
  assessFrameQuality,
} from "../lib/quality";

/**
 * Helper to create synthetic ImageData-like objects.
 */
function createSyntheticImageData(width, height, fillFn) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a] = fillFn(x, y);
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = a !== undefined ? a : 255;
    }
  }
  return { data, width, height };
}

describe("quality.js CV unit tests", () => {
  it("brightness: correctly computes black, white, and weighted RGB values", () => {
    const black = createSyntheticImageData(10, 10, () => [0, 0, 0]);
    expect(brightness(black)).toBe(0);

    const white = createSyntheticImageData(10, 10, () => [255, 255, 255]);
    expect(Math.round(brightness(white))).toBe(255);

    // Pure red: 0.299 * 255 = 76.245
    const red = createSyntheticImageData(10, 10, () => [255, 0, 0]);
    expect(Math.round(brightness(red))).toBe(76);
  });

  it("toGrayscaleArray: returns correct Float32Array size and values", () => {
    const img = createSyntheticImageData(4, 4, () => [100, 100, 100]);
    const gray = toGrayscaleArray(img);
    expect(gray.length).toBe(16);
    expect(Math.round(gray[0])).toBe(100);
  });

  it("blurScore: uniform image has 0 variance; high-contrast edge has high variance", () => {
    // Completely uniform gray -> Laplacian is 0 everywhere -> variance is 0
    const uniform = createSyntheticImageData(20, 20, () => [128, 128, 128]);
    expect(blurScore(uniform)).toBe(0);

    // Checkerboard pattern -> sharp edges -> high Laplacian variance
    const sharp = createSyntheticImageData(20, 20, (x, y) =>
      (x + y) % 2 === 0 ? [255, 255, 255] : [0, 0, 0]
    );
    expect(blurScore(sharp)).toBeGreaterThan(100);
  });

  it("glareFraction: detects saturated pixels > 250", () => {
    // 50% saturated glare pixels, 50% dark
    const halfGlare = createSyntheticImageData(10, 10, (x) =>
      x < 5 ? [255, 255, 255] : [100, 100, 100]
    );
    expect(glareFraction(halfGlare)).toBe(0.5);

    const noGlare = createSyntheticImageData(10, 10, () => [240, 240, 240]);
    expect(glareFraction(noGlare)).toBe(0);
  });

  it("motionScore: identical frames return 0; shifted frames return positive score", () => {
    const img1 = createSyntheticImageData(10, 10, () => [100, 100, 100]);
    const gray1 = toGrayscaleArray(img1);
    const gray2 = toGrayscaleArray(img1);

    expect(motionScore(gray1, gray2)).toBe(0);

    const imgDiff = createSyntheticImageData(10, 10, () => [150, 150, 150]);
    const grayDiff = toGrayscaleArray(imgDiff);
    expect(motionScore(gray1, grayDiff)).toBe(50);
  });

  it("fillRatio: foreground different from background border registers as fill", () => {
    // 30x30 image: background 50, center 15x15 is 200
    const framed = createSyntheticImageData(30, 30, (x, y) => {
      if (x >= 7 && x <= 22 && y >= 7 && y <= 22) {
        return [200, 200, 200];
      }
      return [50, 50, 50];
    });
    const fill = fillRatio(framed);
    expect(fill).toBeGreaterThan(0.2);
    expect(fill).toBeLessThan(0.6);
  });

  it("assessFrameQuality: flags dark frames and gives prioritized feedback", () => {
    const dark = createSyntheticImageData(20, 20, () => [10, 10, 10]);
    const res = assessFrameQuality(dark);
    expect(res.ok).toBe(false);
    expect(res.issue.toLowerCase()).toContain("dark");
    expect(res.severity).toBe("red");
  });

  it("assessFrameQuality: flags glare frames when glare exceeds threshold", () => {
    // Bright image with 30% saturated white glare pixels
    const glareImg = createSyntheticImageData(30, 30, (x) =>
      x < 10 ? [255, 255, 255] : [140, 140, 140]
    );
    const res = assessFrameQuality(glareImg);
    expect(res.ok).toBe(false);
    expect(res.issue.toLowerCase()).toContain("glare");
  });
});
