// ─────────────────────────────────────────────────────────────────────────────
//  api.js  —  Centralised API layer for MediCheck AI
//  Handles: base URL, wake-up ping, fetch with timeout + auto-retry
// ─────────────────────────────────────────────────────────────────────────────

export const API = "https://medicheck-ai-njtm.onrender.com";

/**
 * fetchWithTimeout
 * ─────────────────
 * Wraps fetch() with:
 *   • A per-attempt abort timeout  (default 20 s)
 *   • Auto-retry with delay        (default 2 retries, 4 s gap)
 *
 * Throws a user-friendly Error on final failure so the caller can
 * display it directly in the UI.
 */
export async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = 20000,
  retries = 2
) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;                          // ✅ success — return immediately
    } catch (err) {
      clearTimeout(timer);

      const isLast = attempt === retries;
      if (isLast) {
        // Surface a friendly message for the UI
        throw new Error(
          "Server unreachable. It may be waking up — please wait 30 seconds and try again."
        );
      }

      // Wait before retrying (exponential-ish: 4 s, 8 s …)
      await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
    }
  }
}

/**
 * warmupServer
 * ─────────────
 * Fire-and-forget GET to the health endpoint.
 * Called once on app mount so Render starts waking up immediately —
 * long before the user clicks "Analyse".
 * Errors are intentionally swallowed.
 */
export async function warmupServer() {
  try {
    await fetch(`${API}/`, {
      signal: AbortSignal.timeout(8000),   // short — we don't care about the response
    });
  } catch (_) {
    /* silent — just poking the server awake */
  }
}