/**
 * medicineGuard.js — Keyword validation for medicine names.
 * Uses whole-word token matching to prevent false rejections of genuine pharmaceuticals
 * (e.g. "Carvedilol", "Carbamazepine", "Calcium carbonate", "Levocarnitine") while rejecting
 * non-medicine inputs (e.g. "cat", "car", "tea", "green tea").
 */

export const BAD_KEYWORDS = new Set([
  "food", "fruit", "vegetable", "animal", "cat", "dog", "bird", "flower",
  "tree", "car", "phone", "laptop", "person", "face", "selfie", "nature",
  "sky", "beach", "mountain", "river", "sea", "chicken", "rice", "curry",
  "coffee", "tea", "juice", "cake", "pizza", "burger", "fish", "egg",
  "plant", "grass", "leaf", "water", "drink", "snack", "biscuit", "bread",
]);

/**
 * Validates a medicine name against known non-medicine keywords.
 * @param {string} medicineName
 * @returns {{ allowed: boolean, matchedTerm?: string }}
 */
export function isMedicineNameAllowed(medicineName) {
  if (!medicineName || typeof medicineName !== "string" || !medicineName.trim()) {
    return { allowed: false, matchedTerm: "empty" };
  }
  const words = medicineName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const matchedBad = words.find((w) => BAD_KEYWORDS.has(w));
  if (matchedBad) {
    return { allowed: false, matchedTerm: matchedBad };
  }
  return { allowed: true };
}
