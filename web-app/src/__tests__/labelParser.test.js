import { describe, it, expect } from "vitest";
import {
  normalizeOcrDigits,
  parseLabelText,
  parseGs1Barcode,
} from "../lib/labelParser";

describe("labelParser.js unit tests", () => {
  it("normalizeOcrDigits: normalizes common character misrecognitions", () => {
    expect(normalizeOcrDigits("O123")).toBe("0123");
    expect(normalizeOcrDigits("I456")).toBe("1456");
    expect(normalizeOcrDigits("S789")).toBe("5789");
    expect(normalizeOcrDigits("B999")).toBe("8999");
  });

  it("parseLabelText: extracts batch numbers from Indian blister packaging formats", () => {
    const ocrSample = `
      Paracetamol Tablets IP 500mg
      B.No. INP24CT69
      MFG. DATE: 09/2024
      EXP. DATE: 08/2027
      M.R.P. Rs. 35.00
    `;
    const result = parseLabelText(ocrSample);
    expect(result.batchCandidates.length).toBeGreaterThan(0);
    expect(result.batchCandidates[0].value).toBe("INP24CT69");

    expect(result.expiryCandidates.length).toBeGreaterThan(0);
    expect(result.expiryCandidates[0].value).toBe("08/2027");
  });

  it("parseLabelText: extracts batch with alternative syntax (Batch:, B. No : )", () => {
    const ocr1 = "Batch: XEB0005 USE BEFORE: AUG 2028";
    const res1 = parseLabelText(ocr1);
    expect(res1.batchCandidates.some((b) => b.value === "XEB0005")).toBe(true);

    const ocr2 = "B. No : T-048 EXP 12/2026";
    const res2 = parseLabelText(ocr2);
    expect(res2.batchCandidates.some((b) => b.value === "T-048")).toBe(true);
  });

  it("parseLabelText: finds fallback standalone dates if prefix missing", () => {
    const textWithoutPrefix = "Metformin HCl 500mg 10/2028 123456";
    const result = parseLabelText(textWithoutPrefix);
    expect(result.expiryCandidates.length).toBeGreaterThan(0);
    expect(result.expiryCandidates[0].value).toBe("10/2028");
  });

  it("parseGs1Barcode: parses standard bracketed GS1 barcode payloads", () => {
    const gs1 = "(01)08901234567890(17)270831(10)INP24CT69(21)SER12345";
    const parsed = parseGs1Barcode(gs1);

    expect(parsed.isGs1).toBe(true);
    expect(parsed.gtin).toBe("08901234567890");
    expect(parsed.expiryDate).toBe("08/2027");
    expect(parsed.batchId).toBe("INP24CT69");
    expect(parsed.serial).toBe("SER12345");
  });

  it("parseGs1Barcode: parses unbracketed continuous GS1 strings", () => {
    const unbracketed = "01089012345678901727083110INP24CT69";
    const parsed = parseGs1Barcode(unbracketed);

    expect(parsed.isGs1).toBe(true);
    expect(parsed.gtin).toBe("08901234567890");
    expect(parsed.expiryDate).toBe("08/2027");
    expect(parsed.batchId).toBe("INP24CT69");
  });

  it("parseGs1Barcode: identifies non-GS1 strings safely", () => {
    const nonGs1 = "https://example.com/pharma/verify";
    const parsed = parseGs1Barcode(nonGs1);
    expect(parsed.isGs1).toBe(false);
    expect(parsed.batchId).toBeNull();
  });
});
