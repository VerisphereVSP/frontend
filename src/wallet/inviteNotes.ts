// frontend/src/wallet/inviteNotes.ts — patch_fe_invite_notes
// A sponsor's private notes on their invitations ("Dan", "cycling group"): kept in this browser only, keyed by the
// invitation's code hash, never sent anywhere. localStorage survives closing the browser; nothing about who was
// invited ever reaches the server, which keeps only wallet-to-wallet rows.
const KEY = (sponsor: string) => `verisphere:invite-notes:${sponsor.toLowerCase()}`;

export function readInviteNotes(sponsor: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY(sponsor));
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function setInviteNote(sponsor: string, codeHash: string, note: string): Record<string, string> {
  const all = readInviteNotes(sponsor);
  const t = note.trim().slice(0, 80);
  if (t) all[codeHash] = t; else delete all[codeHash];
  try { localStorage.setItem(KEY(sponsor), JSON.stringify(all)); } catch { /* private mode: the note lives for this page only */ }
  return all;
}

// patch_fe_invite_reshare — the codes themselves, same place, same rule: the server stores only the hash, so a code
// can be reshared only from the browser that first showed it.
const CODES = (sponsor: string) => `verisphere:invite-codes:${sponsor.toLowerCase()}`;

export function readInviteCodes(sponsor: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(CODES(sponsor));
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function rememberInviteCode(sponsor: string, codeHash: string, code: string): void {
  const all = readInviteCodes(sponsor);
  all[codeHash] = code;
  try { localStorage.setItem(CODES(sponsor), JSON.stringify(all)); } catch { /* private mode */ }
}

export function forgetInviteCode(sponsor: string, codeHash: string): void {
  const all = readInviteCodes(sponsor);
  delete all[codeHash];
  try { localStorage.setItem(CODES(sponsor), JSON.stringify(all)); } catch { /* private mode */ }
}

/** The link a reshared invitation carries: the claim's share page when it was shared from one, else the app's Start. */
export function inviteLink(origin: string, code: string, postId: number | null | undefined): string {
  return postId != null
    ? `${origin}/c/${postId}?code=${encodeURIComponent(code)}`
    : `${origin}/claims?code=${encodeURIComponent(code)}&start=1`;
}
