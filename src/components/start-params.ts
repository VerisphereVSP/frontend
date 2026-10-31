// frontend/src/components/start-params.ts — patch_fe_start (v2 step 4c)
// The Start hand-off from the share page: /claims?post=<id>&side=<support|challenge>&start=1[&code=VSP-…].
// Pure helpers (no imports) so ClaimsExplorer and App can read the same thing without touching the overlay.
export type Side = "support" | "challenge";
export interface StartParams { postId: number; side: Side | null; code: string | null }

export function startParams(search: string = typeof window !== "undefined" ? window.location.search : ""): StartParams | null {
  try {
    const q = new URLSearchParams(search);
    if (q.get("start") !== "1") return null;
    const post = q.get("post");
    if (!post || !/^\d+$/.test(post)) return null;
    const s = q.get("side");
    return { postId: Number(post), side: s === "support" || s === "challenge" ? s : null, code: q.get("code") };
  } catch { return null; }
}

/** What the address bar should read once the overlay closes: the claim stays, the hand-off parameters go. */
export function closedStartUrl(pathname: string, search: string): string {
  const q = new URLSearchParams(search);
  q.delete("start"); q.delete("side"); q.delete("code");
  const s = q.toString();
  return `${pathname}${s ? "?" + s : ""}`;
}
