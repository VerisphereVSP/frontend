// patch_guide_v3: How to Play leads with the passkey wallet and the share link, and covers invitations and the extension.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const guide = readFileSync(resolve(process.cwd(), "public/docs/guide.md"), "utf8");
const heads = guide.split("\n").filter((l) => /^#{1,4} /.test(l));

describe("How to Play (v3)", () => {
  it("opens with the rule and the quick way in, then MetaMask as the alternative", () => {
    expect(guide).toContain("Claims settle every day: the side the score favours gains VSP, the other side loses it. Right and early gains the most.");
    const order = ["## Part 1 — Get in", "### The quick way: a passkey wallet (recommended)", "### Arriving from a share link", "### If you already use MetaMask", "#### Step 1. Install MetaMask", "### Buying VSP", "## Part 2 — Your first actions", "### Share a claim — and put VSP on the table", "### The extension", "## Quick reference", "## Troubleshooting"];
    let last = -1;
    for (const h of order) { const i = heads.indexOf(h); expect(i, h).toBeGreaterThan(last); last = i; }
  });
  it("tells the passkey story completely: create, unlock, sync, recovery key, no pop-ups, what it cannot do yet", () => {
    for (const s of ["Choose **Passkey** (first in the list)", "**Show recovery key**", "iCloud Keychain, Google Password Manager", "Verisphere never sees it", "**With a passkey wallet** there are no pop-ups at all", "a passkey wallet cannot sign in it yet"]) expect(guide).toContain(s);
  });
  it("explains invitations as the sender and the receiver see them", () => {
    for (const s of ["**Include an invitation**", "Each invitation can be claimed once", "**Revoke** it earlier from **Positions**", "**Claim** it into your wallet", "already claimed or has expired"]) expect(guide).toContain(s);
  });
  it("keeps the vocabulary rule", () => {
    for (const banned of [/invest/i, /appreciat/i, /\breturns?\b/i, /profit/i]) expect(guide).not.toMatch(banned);
  });
});
