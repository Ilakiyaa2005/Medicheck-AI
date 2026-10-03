import { describe, it, expect } from "vitest";
import {
  getLastDayOfMonth,
  parseExpiryDate,
  checkExpiryStatus,
} from "../lib/expiry";

describe("expiry.js date logic unit tests", () => {
  it("getLastDayOfMonth: handles leap years and standard months correctly", () => {
    // 2028 is leap year -> Feb has 29 days
    expect(getLastDayOfMonth(2028, 2)).toBe(29);
    // 2027 is non-leap year -> Feb has 28 days
    expect(getLastDayOfMonth(2027, 2)).toBe(28);
    // 2000 is century leap year -> 29
    expect(getLastDayOfMonth(2000, 2)).toBe(29);
    // 1900 is non-leap century -> 28
    expect(getLastDayOfMonth(1900, 2)).toBe(28);
    // August always has 31 days
    expect(getLastDayOfMonth(2027, 8)).toBe(31);
    // April has 30 days
    expect(getLastDayOfMonth(2027, 4)).toBe(30);
  });

  it("parseExpiryDate: parses various pharmaceutical date formats", () => {
    // MM/YYYY
    const r1 = parseExpiryDate("08/2027");
    expect(r1.isValidFormat).toBe(true);
    expect(r1.date.getFullYear()).toBe(2027);
    expect(r1.date.getMonth()).toBe(7); // 0-indexed month for August
    expect(r1.date.getDate()).toBe(31);

    // MM/YY (2-digit year)
    const r2 = parseExpiryDate("08/27");
    expect(r2.isValidFormat).toBe(true);
    expect(r2.date.getFullYear()).toBe(2027);

    // Month name
    const r3 = parseExpiryDate("AUG 2027");
    expect(r3.isValidFormat).toBe(true);
    expect(r3.date.getMonth()).toBe(7);

    // YYYY-MM
    const r4 = parseExpiryDate("2027-08");
    expect(r4.isValidFormat).toBe(true);
    expect(r4.date.getFullYear()).toBe(2027);
    expect(r4.date.getMonth()).toBe(7);

    // DD/MM/YYYY
    const r5 = parseExpiryDate("15/04/2026");
    expect(r5.isValidFormat).toBe(true);
    expect(r5.date.getDate()).toBe(15);
    expect(r5.date.getMonth()).toBe(3); // April
  });

  it("checkExpiryStatus: end-of-month valid logic (valid on last day of month, expired next day)", () => {
    // "08/2027" expires on Aug 31, 2027 at 23:59:59.999
    const aug31Noon = new Date("2027-08-31T12:00:00Z");
    const statusOnAug31 = checkExpiryStatus("08/2027", aug31Noon);
    expect(statusOnAug31.status).not.toBe("expired");

    const sep01Morning = new Date("2027-09-01T08:00:00Z");
    const statusOnSep01 = checkExpiryStatus("08/2027", sep01Morning);
    expect(statusOnSep01.status).toBe("expired");
    expect(statusOnSep01.message).toContain("Expired");
  });

  it("checkExpiryStatus: marks expiring_soon when within 90 days", () => {
    const today = new Date("2026-05-01T00:00:00Z");
    // June 2026 is ~60 days away
    const res = checkExpiryStatus("06/2026", today);
    expect(res.status).toBe("expiring_soon");
    expect(res.daysRemaining).toBeGreaterThan(0);
    expect(res.daysRemaining).toBeLessThanOrEqual(90);
  });

  it("checkExpiryStatus: handles invalid or missing dates gracefully", () => {
    const resEmpty = checkExpiryStatus("");
    expect(resEmpty.status).toBe("unknown");
    expect(resEmpty.daysRemaining).toBeNull();

    const resGibberish = checkExpiryStatus("XYZ-NOT-A-DATE");
    expect(resGibberish.status).toBe("unknown");
  });
});
