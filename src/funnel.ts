// frontend/src/funnel.ts — patch_fe_funnel (v2 step 5a)
// One anonymous count per Start-sheet step: {step} and nothing else — no address, no id, no cookie. Fire-and-forget;
// the app never waits on it or shows an error for it.
const API = import.meta.env.VITE_API_BASE || "/api";
export type FunnelStep = "start_open" | "start_wallet" | "start_funded" | "start_staked" | "start_skip" | "ext_install_tap"
  | "start_claim_shown" | "start_claim_ok" | "start_claim_fail" | "pending_banner_tap"  // patch_fe_install_ext; patch_fe_start_claim
  | "app_visit";  // patch_fe_visits

export function track(step: FunnelStep, src?: string | null): void {
  try {
    const body = JSON.stringify(src ? { step, src } : { step });
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

// patch_fe_visits: one anonymous count when the app is opened, once per browser session. The "already counted" flag lives
// in sessionStorage and is never sent; nothing identifies the visitor. If the address carries ?src=<tag> (a tag on a
// link Verisphere handed out: fb, x, lw …) the tag rides along, so visits can be told apart by the post they came from.
const VISIT_FLAG = "vsp_visit_counted";
const SRC_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/;

export function sourceTag(search: string): string | null {
  try {
    const s = (new URLSearchParams(search).get("src") || "").trim().toLowerCase();
    return SRC_RE.test(s) ? s : null;
  } catch { return null; }
}

export function trackVisit(): void {
  try {
    if (typeof window === "undefined") return;
    let seen = false;
    try { seen = window.sessionStorage.getItem(VISIT_FLAG) === "1"; } catch { /* storage blocked: count this load */ }
    if (seen) return;
    try { window.sessionStorage.setItem(VISIT_FLAG, "1"); } catch { /* nothing to do */ }
    track("app_visit", sourceTag(window.location.search));
  } catch { /* nothing to do */ }
}
