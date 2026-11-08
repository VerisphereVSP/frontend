// frontend/src/funnel.ts — patch_fe_funnel (v2 step 5a)
// One anonymous count per Start-sheet step: {step} and nothing else — no address, no id, no cookie. Fire-and-forget;
// the app never waits on it or shows an error for it.
const API = import.meta.env.VITE_API_BASE || "/api";
export type FunnelStep = "start_open" | "start_wallet" | "start_funded" | "start_staked" | "start_skip" | "ext_install_tap"
  | "start_claim_shown" | "start_claim_ok" | "start_claim_fail" | "pending_banner_tap";  // patch_fe_install_ext; patch_fe_start_claim

export function track(step: FunnelStep): void {
  try {
    const body = JSON.stringify({ step });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(`${API}/funnel`, new Blob([body], { type: "application/json" }));
      return;
    }
    fetch(`${API}/funnel`, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch { /* nothing to do */ }
}

/** Counts each step once per sheet, whatever order the renders come in. */
export function onceTracker() {
  const seen = new Set<FunnelStep>();
  return (step: FunnelStep) => { if (!seen.has(step)) { seen.add(step); track(step); } };
}
