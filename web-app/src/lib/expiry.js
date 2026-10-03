/**
 * expiry.js — Pure date logic for pharmaceutical expiration assessment.
 * A medicine printed "EXP 08/2027" remains valid until the last second of August 31, 2027.
 */

const MONTH_NAMES = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/**
 * Returns the last day of a given month and year (accounting for leap years).
 * @param {number} year - Full 4-digit year (e.g. 2028)
 * @param {number} month - 1-indexed month (1 = Jan, 12 = Dec)
 * @returns {number} 28, 29, 30, or 31
 */
export function getLastDayOfMonth(year, month) {
  // Day 0 of next month is the last day of the target month
  return new Date(year, month, 0).getDate();
}

/**
 * Parses raw text or structured string into an end-of-month expiration Date object.
 * Supports formats:
 *   - "08/2027", "08-2027", "08.2027", "08/27"
 *   - "AUG 2027", "AUG.2027", "AUGUST 2027"
 *   - "2027-08", "2027/08"
 *   - "31/08/2027", "31-08-2027", "2027-08-31"
 * @param {string} rawDateStr
 * @returns {{ date: Date | null, display: string, isValidFormat: boolean }}
 */
export function parseExpiryDate(rawDateStr) {
  if (!rawDateStr || typeof rawDateStr !== "string") {
    return { date: null, display: "", isValidFormat: false };
  }

  const s = rawDateStr.trim().toUpperCase().replace(/[\.]/g, "/");

  // 1. Day/Month/Year or Year-Month-Day (Full date)
  // e.g. 31/08/2027 or 31-08-2027
  const fullDmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (fullDmy) {
    const day = parseInt(fullDmy[1], 10);
    const month = parseInt(fullDmy[2], 10);
    let year = parseInt(fullDmy[3], 10);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12) {
      const maxDay = getLastDayOfMonth(year, month);
      const validDay = Math.min(day, maxDay);
      const date = new Date(year, month - 1, validDay, 23, 59, 59, 999);
      const display = `${String(validDay).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
      return { date, display, isValidFormat: true };
    }
  }

  // 2. Month/Year with month word (e.g. "AUG 2027", "AUGUST/2027")
  const wordMatch = s.match(/([A-Z]{3,9})[\s\/\-]+(\d{2,4})/);
  if (wordMatch) {
    const mName = wordMatch[1].toLowerCase();
    const month = MONTH_NAMES[mName];
    let year = parseInt(wordMatch[2], 10);
    if (year < 100) year += 2000;
    if (month) {
      const lastDay = getLastDayOfMonth(year, month);
      const date = new Date(year, month - 1, lastDay, 23, 59, 59, 999);
      const display = `${String(month).padStart(2, "0")}/${year}`;
      return { date, display, isValidFormat: true };
    }
  }

  // 3. YYYY/MM or YYYY-MM
  const yyyymm = s.match(/^(\d{4})[\/\-](\d{1,2})$/);
  if (yyyymm) {
    const year = parseInt(yyyymm[1], 10);
    const month = parseInt(yyyymm[2], 10);
    if (month >= 1 && month <= 12) {
      const lastDay = getLastDayOfMonth(year, month);
      const date = new Date(year, month - 1, lastDay, 23, 59, 59, 999);
      const display = `${String(month).padStart(2, "0")}/${year}`;
      return { date, display, isValidFormat: true };
    }
  }

  // 4. MM/YYYY or MM/YY
  const mmyyyy = s.match(/^(\d{1,2})[\/\-](\d{2,4})$/);
  if (mmyyyy) {
    const month = parseInt(mmyyyy[1], 10);
    let year = parseInt(mmyyyy[2], 10);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12) {
      const lastDay = getLastDayOfMonth(year, month);
      const date = new Date(year, month - 1, lastDay, 23, 59, 59, 999);
      const display = `${String(month).padStart(2, "0")}/${year}`;
      return { date, display, isValidFormat: true };
    }
  }

  return { date: null, display: rawDateStr.trim(), isValidFormat: false };
}

/**
 * Assesses expiry status relative to a reference date.
 * @param {string | Date} expiryInput
 * @param {Date} [referenceDate=new Date()] - Injected for unit testing
 * @returns {{
 *   status: 'valid' | 'expiring_soon' | 'expired' | 'unknown',
 *   daysRemaining: number | null,
 *   formattedExpiry: string,
 *   message: string
 * }}
 */
export function checkExpiryStatus(expiryInput, referenceDate = new Date()) {
  let expDate = null;
  let display = "";

  if (expiryInput instanceof Date) {
    expDate = expiryInput;
    display = `${String(expDate.getMonth() + 1).padStart(2, "0")}/${expDate.getFullYear()}`;
  } else if (typeof expiryInput === "string") {
    const parsed = parseExpiryDate(expiryInput);
    expDate = parsed.date;
    display = parsed.display;
  }

  if (!expDate || isNaN(expDate.getTime())) {
    return {
      status: "unknown",
      daysRemaining: null,
      formattedExpiry: display || "Not provided",
      message: "Expiry date unverified",
    };
  }

  const msDiff = expDate.getTime() - referenceDate.getTime();

  if (msDiff < 0) {
    const daysAgo = Math.max(1, Math.ceil(Math.abs(msDiff) / (1000 * 60 * 60 * 24)));
    return {
      status: "expired",
      daysRemaining: -daysAgo,
      formattedExpiry: display,
      message: `Expired ${daysAgo} day${daysAgo === 1 ? "" : "s"} ago — DO NOT USE`,
    };
  }

  const daysDiff = Math.ceil(msDiff / (1000 * 60 * 60 * 24));

  if (daysDiff <= 90) {
    return {
      status: "expiring_soon",
      daysRemaining: daysDiff,
      formattedExpiry: display,
      message: `Expiring soon (in ${daysDiff} days)`,
    };
  } else {
    return {
      status: "valid",
      daysRemaining: daysDiff,
      formattedExpiry: display,
      message: `Valid (${daysDiff} days remaining)`,
    };
  }
}
