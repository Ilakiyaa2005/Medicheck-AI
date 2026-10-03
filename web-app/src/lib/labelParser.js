/**
 * labelParser.js — Parser for pharmaceutical packaging text and barcodes.
 * Handles Indian blister packs, strip labels, OCR character confusions, and GS1 barcodes.
 */

import { parseExpiryDate } from "./expiry";

/**
 * Normalizes common OCR digit confusions in digit-predominant tokens.
 * E.g., 'O' -> '0', 'I' -> '1', 'S' -> '5', 'B' -> '8'.
 * @param {string} text
 * @returns {string}
 */
export function normalizeOcrDigits(text) {
  if (!text) return "";
  return text
    .replace(/[Oo]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/\bB(\d)/g, "8$1");
}

/**
 * Extracts batch numbers and expiry dates from freeform OCR text.
 * @param {string} rawOcrText
 * @returns {{
 *   batchCandidates: Array<{ value: string, confidence: number, source: string }>,
 *   expiryCandidates: Array<{ value: string, confidence: number, source: string, parsedDate: Date | null }>,
 *   mfgCandidates: Array<{ value: string, confidence: number }>
 * }}
 */
export function parseLabelText(rawOcrText) {
  if (!rawOcrText || typeof rawOcrText !== "string") {
    return { batchCandidates: [], expiryCandidates: [], mfgCandidates: [] };
  }

  const lines = rawOcrText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fullText = lines.join(" ");

  const batchCandidates = [];
  const expiryCandidates = [];
  const mfgCandidates = [];

  // 1. Batch number extraction
  // Matches patterns like:
  // "B.No. INP24CT69", "Batch: XEB0005", "Lot No. 1234", "B. No : T-048", "BATCH NO. FFT241205"
  const batchRegex = /(?:B(?:atch)?\.?\s*No\.?|LOT(?:\s*No\.?)?|B\.?\s*NO|BATCH)\s*[:.\-]?\s*([A-Za-z0-9\-\/]{3,18})/gi;
  let match;
  while ((match = batchRegex.exec(fullText)) !== null) {
    const rawVal = match[1].trim();
    if (rawVal.length >= 3) {
      batchCandidates.push({
        value: rawVal.toUpperCase(),
        confidence: 0.90,
        source: match[0],
      });
    }
  }

  // 2. Expiry date extraction
  // Matches:
  // "EXP. 08/2027", "EXP. DATE: 08/2027", "EXP DATE: AUG 2027", "Expiry Date 08-27", "Use Before: 31/08/2027"
  const expRegex = /(?:EXP(?:IRY)?\.?\s*(?:DATE|DT)?\.?|USE\s*BEFORE|BEST\s*BEFORE)\s*[:.\-]?\s*([A-Za-z0-9\/\.\-]{5,12})/gi;
  while ((match = expRegex.exec(fullText)) !== null) {
    const rawExp = match[1].trim();
    const parsed = parseExpiryDate(rawExp);
    if (parsed.isValidFormat) {
      expiryCandidates.push({
        value: parsed.display,
        confidence: 0.95,
        source: match[0],
        parsedDate: parsed.date,
      });
    }
  }

  // 3. Fallback: Search standalone date patterns if not matched with prefix
  if (expiryCandidates.length === 0) {
    // Looks for standalone MM/YYYY or Month YYYY
    const standaloneDateRegex = /\b(0[1-9]|1[0-2])[\/\.\-](20\d{2}|\d{2})\b|\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[\s\/\.\-]+(20\d{2}|\d{2})\b/gi;
    while ((match = standaloneDateRegex.exec(fullText)) !== null) {
      const parsed = parseExpiryDate(match[0]);
      if (parsed.isValidFormat) {
        expiryCandidates.push({
          value: parsed.display,
          confidence: 0.70,
          source: match[0],
          parsedDate: parsed.date,
        });
      }
    }
  }

  // 4. Mfg date extraction
  const mfgRegex = /(?:MFG|MFD|MANUFACTURED)\.?\s*(?:DATE|DT)?\.?\s*[:.\-]?\s*([A-Za-z0-9\/\.\-]{5,12})/gi;
  while ((match = mfgRegex.exec(fullText)) !== null) {
    mfgCandidates.push({
      value: match[1].trim(),
      confidence: 0.85,
    });
  }

  // Deduplicate candidates
  const uniqueBatches = [];
  const seenBatches = new Set();
  for (const b of batchCandidates) {
    if (!seenBatches.has(b.value)) {
      seenBatches.add(b.value);
      uniqueBatches.push(b);
    }
  }

  const uniqueExp = [];
  const seenExp = new Set();
  for (const e of expiryCandidates) {
    if (!seenExp.has(e.value)) {
      seenExp.add(e.value);
      uniqueExp.push(e);
    }
  }

  return {
    batchCandidates: uniqueBatches,
    expiryCandidates: uniqueExp,
    mfgCandidates,
  };
}

/**
 * Parses GS1 Datamatrix / QR Application Identifier (AI) payloads.
 * AI standards:
 *   - '01': GTIN (14 digits)
 *   - '10': Batch/Lot (up to 20 alphanum)
 *   - '17': Expiry Date (YYMMDD)
 *   - '21': Serial number
 * @param {string} barcodeRawText
 * @returns {{
 *   isGs1: boolean,
 *   gtin: string | null,
 *   batchId: string | null,
 *   expiryDate: string | null,
 *   serial: string | null,
 *   raw: string
 * }}
 */
export function parseGs1Barcode(barcodeRawText) {
  if (!barcodeRawText || typeof barcodeRawText !== "string") {
    return { isGs1: false, gtin: null, batchId: null, expiryDate: null, serial: null, raw: "" };
  }

  const text = barcodeRawText.trim();
  let gtin = null;
  let batchId = null;
  let expiryDate = null;
  let serial = null;
  let isGs1 = false;

  // Bracketed GS1: e.g. (01)08901234567890(17)270831(10)INP24CT69
  if (text.includes("(") && text.includes(")")) {
    isGs1 = true;
    const gtinMatch = text.match(/\(01\)(\d{14})/);
    if (gtinMatch) gtin = gtinMatch[1];

    const expMatch = text.match(/\(17\)(\d{6})/);
    if (expMatch) {
      const yy = expMatch[1].slice(0, 2);
      const mm = expMatch[1].slice(2, 4);
      const dd = expMatch[1].slice(4, 6);
      expiryDate = `${mm}/20${yy}`;
    }

    const batchMatch = text.match(/\(10\)([A-Za-z0-9\-]+)/);
    if (batchMatch) batchId = batchMatch[1];

    const serMatch = text.match(/\(21\)([A-Za-z0-9\-]+)/);
    if (serMatch) serial = serMatch[1];
  } else if (/^01\d{14}17\d{6}10/.test(text)) {
    // Non-bracketed GS1 with standard element strings
    isGs1 = true;
    gtin = text.slice(2, 16);
    const yymmdd = text.slice(18, 24);
    expiryDate = `${yymmdd.slice(2, 4)}/20${yymmdd.slice(0, 2)}`;
    batchId = text.slice(26).split(/[\x1D\s]/)[0];
  }

  return {
    isGs1,
    gtin,
    batchId,
    expiryDate,
    serial,
    raw: text,
  };
}
