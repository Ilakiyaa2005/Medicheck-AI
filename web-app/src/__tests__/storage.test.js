import { describe, it, expect, beforeEach } from "vitest";
import {
  loadHistory,
  saveScan,
  deleteScan,
  clearHistory,
  importHistory,
  loadSettings,
  saveSettings,
} from "../lib/storage";

describe("storage.js unit tests", () => {
  let store = {};

  beforeEach(() => {
    store = {};
    const mockLocalStorage = {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, val) => {
        store[key] = String(val);
      },
      removeItem: (key) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };

    Object.defineProperty(globalThis, "localStorage", {
      value: mockLocalStorage,
      writable: true,
    });

    if (!globalThis.window) {
      globalThis.window = {
        dispatchEvent: () => {},
      };
    }
  });

  it("loadHistory: returns empty array when empty or invalid", () => {
    expect(loadHistory()).toEqual([]);
    localStorage.setItem("medicheck.history.v1", "invalid json");
    expect(loadHistory()).toEqual([]);
  });

  it("saveScan: prepends scan, caps at 100 records", () => {
    const scan1 = { scan_id: "scan-1", medicine_name: "Paracetamol", timestamp: "2026-01-01T00:00:00Z" };
    const scan2 = { scan_id: "scan-2", medicine_name: "Metformin", timestamp: "2026-01-02T00:00:00Z" };

    saveScan(scan1);
    const updated = saveScan(scan2);

    expect(updated.length).toBe(2);
    expect(updated[0].scan_id).toBe("scan-2");
    expect(updated[1].scan_id).toBe("scan-1");

    // Test 100 cap
    for (let i = 3; i <= 105; i++) {
      saveScan({ scan_id: `scan-${i}`, medicine_name: `Med ${i}`, timestamp: new Date().toISOString() });
    }
    const finalHistory = loadHistory();
    expect(finalHistory.length).toBe(100);
  });

  it("deleteScan: removes scan by scan_id", () => {
    saveScan({ scan_id: "s1", medicine_name: "Med1" });
    saveScan({ scan_id: "s2", medicine_name: "Med2" });

    const afterDelete = deleteScan("s1");
    expect(afterDelete.length).toBe(1);
    expect(afterDelete[0].scan_id).toBe("s2");
  });

  it("clearHistory: removes all scan records", () => {
    saveScan({ scan_id: "s1", medicine_name: "Med1" });
    saveScan({ scan_id: "s2", medicine_name: "Med2" });

    const empty = clearHistory();
    expect(empty).toEqual([]);
    expect(loadHistory()).toEqual([]);
  });

  it("importHistory: validates array, merges and deduplicates by scan_id", () => {
    saveScan({ scan_id: "s1", medicine_name: "Existing Med", timestamp: "2026-01-01T00:00:00Z" });

    const importedJson = JSON.stringify([
      { scan_id: "s1", medicine_name: "Duplicate S1", timestamp: "2026-01-01T00:00:00Z" },
      { scan_id: "s2", medicine_name: "New Med", timestamp: "2026-01-02T00:00:00Z" },
    ]);

    const merged = importHistory(importedJson);
    expect(merged.length).toBe(2);
    expect(merged.some((s) => s.scan_id === "s1")).toBe(true);
    expect(merged.some((s) => s.scan_id === "s2")).toBe(true);

    // Invalid JSON throws error
    expect(() => importHistory('{"not": "array"}')).toThrow();
  });

  it("settings: load and save settings", () => {
    const defaultSettings = loadSettings();
    expect(defaultSettings.autoCapture).toBe(true);

    saveSettings({ autoCapture: false, soundEnabled: true });
    const loaded = loadSettings();
    expect(loaded.autoCapture).toBe(false);
    expect(loaded.soundEnabled).toBe(true);
  });
});
