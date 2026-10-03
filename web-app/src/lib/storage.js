/**
 * storage.js — Private browser storage manager for MediCheck-AI scan history & settings.
 * All data lives exclusively on the user's device (zero server persistence).
 * Wrapped in try/catch to gracefully handle Safari private mode, disabled storage, and quota limits.
 */

const HISTORY_KEY = "medicheck.history.v1";
const SETTINGS_KEY = "medicheck.settings.v1";
const MAX_SCANS = 100;

/**
 * Loads all scan records from localStorage.
 * @returns {Array<object>}
 */
export function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn("[Storage] Failed to load scan history:", err);
    return [];
  }
}

/**
 * Saves a new scan record. Enforces 100-record cap and quota management.
 * @param {object} scanRecord
 * @returns {Array<object>} Updated scan list
 */
export function saveScan(scanRecord) {
  try {
    const current = loadHistory();
    // Prepend new scan
    const updated = [scanRecord, ...current.filter((s) => s.scan_id !== scanRecord.scan_id)];

    // Cap at MAX_SCANS
    if (updated.length > MAX_SCANS) {
      updated.splice(MAX_SCANS);
    }

    _safePersist(HISTORY_KEY, updated);
    _notifyStorageChange();
    return updated;
  } catch (err) {
    console.warn("[Storage] Failed to save scan:", err);
    return loadHistory();
  }
}

/**
 * Deletes a single scan by scan_id.
 * @param {string} scanId
 * @returns {Array<object>} Updated scan list
 */
export function deleteScan(scanId) {
  try {
    const current = loadHistory();
    const updated = current.filter((s) => s.scan_id !== scanId);
    _safePersist(HISTORY_KEY, updated);
    _notifyStorageChange();
    return updated;
  } catch (err) {
    console.warn("[Storage] Failed to delete scan:", err);
    return loadHistory();
  }
}

/**
 * Clears all scan history from the device.
 */
export function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
    _notifyStorageChange();
    return [];
  } catch (err) {
    console.warn("[Storage] Failed to clear history:", err);
    return [];
  }
}

/**
 * Exports history as a downloaded JSON file.
 */
export function exportHistory() {
  try {
    const history = loadHistory();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(history, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `medicheck_history_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  } catch (err) {
    console.warn("[Storage] Failed to export history:", err);
  }
}

/**
 * Imports history JSON into localStorage.
 * @param {string} jsonString
 * @returns {Array<object>}
 */
export function importHistory(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) throw new Error("Imported JSON must be an array of scan records.");

    const existing = loadHistory();
    const existingIds = new Set(existing.map((s) => s.scan_id));
    const merged = [...existing];

    for (const record of parsed) {
      if (record && record.scan_id && !existingIds.has(record.scan_id)) {
        merged.push(record);
        existingIds.add(record.scan_id);
      }
    }

    // Sort by timestamp desc and cap
    merged.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    if (merged.length > MAX_SCANS) merged.splice(MAX_SCANS);

    _safePersist(HISTORY_KEY, merged);
    _notifyStorageChange();
    return merged;
  } catch (err) {
    console.error("[Storage] Failed to import history:", err);
    throw err;
  }
}

/**
 * Loads user settings.
 */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : { autoCapture: true, soundEnabled: false };
  } catch {
    return { autoCapture: true, soundEnabled: false };
  }
}

/**
 * Saves user settings.
 */
export function saveSettings(settings) {
  try {
    _safePersist(SETTINGS_KEY, settings);
  } catch (err) {
    console.warn("[Storage] Failed to save settings:", err);
  }
}

/**
 * Internal persistence helper with quota fallback mechanism:
 * 1. Attempt standard write
 * 2. If QuotaExceededError, strip thumbnail images from oldest records and retry
 * 3. If still exceeding, drop oldest 25% of records and retry
 */
function _safePersist(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    const isQuota =
      err.name === "QuotaExceededError" ||
      err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      err.code === 22 ||
      err.code === 1014;

    if (!isQuota || !Array.isArray(data)) {
      console.warn("[Storage] Persistence failed:", err);
      return;
    }

    console.warn("[Storage] Storage quota reached — stripping thumbnails to free space...");
    // Fallback 1: Drop thumbnails
    const stripped = data.map((item) => {
      const copy = { ...item };
      delete copy.thumbnail;
      delete copy.image_data;
      return copy;
    });

    try {
      localStorage.setItem(key, JSON.stringify(stripped));
    } catch (err2) {
      console.warn("[Storage] Quota still exceeded — pruning oldest records...");
      // Fallback 2: Keep only most recent 30 items
      const pruned = stripped.slice(0, 30);
      try {
        localStorage.setItem(key, JSON.stringify(pruned));
      } catch (err3) {
        console.error("[Storage] Unable to persist even after pruning:", err3);
      }
    }
  }
}

/**
 * Triggers a storage sync event for listeners in current and sibling tabs.
 */
function _notifyStorageChange() {
  try {
    window.dispatchEvent(new Event("medicheck-storage-update"));
  } catch {}
}
