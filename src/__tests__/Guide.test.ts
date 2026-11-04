// patch_guide_v3: How to Play leads with the passkey wallet and the share link, and covers invitations and the extension.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const guide = readFileSync(resolve(process.cwd(), "public/docs/guide.md"), "utf8");
const heads = guide.split("\n").filter((l) => /^#{1,4} /.test(l)).map((l) => l.replace(/\s*<!--.*?-->\s*$/, ""));

describe("How to Play (v3)", () => {
  it("opens with the rule and the quick way in, then MetaMask as the alternative", () => {
    expect(guide).toContain("Nobody's gain comes from anybody's loss.");
    const order = ["## What this is — and what it isn't", "## Part 1 — Get in", "### The quick way: a passkey wallet (recommended)", "### Arriving from a share link", "### If you already use MetaMask", "#### Step 1. Install MetaMask", "### Buying VSP", "## Part 2 — Your first actions", "### Share a claim — and put VSP on the table", "### The extension", "## Quick reference", "## Troubleshooting"];
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

describe("not a bet (patch_not_a_bet)", () => {
  it("the three facts appear in the guide and in About, and the wordmark links to the landing page", () => {
    const about = readFileSync(resolve(process.cwd(), "public/docs/about.md"), "utf8");
    for (const doc of [guide, about]) {
      for (const s of ["**Nothing is resolved.**", "**It is not zero-sum.**", "**Nobody's gain comes from anybody's loss.**", "not a bet, and this is not a market on outcomes"]) expect(doc).toContain(s);
    }
    expect(guide).not.toMatch(/the other side loses it|Right and early gains the most|is an opportunity/);
    const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    expect(app).toContain('<a href="https://verisphere.co" data-testid="brand-link"');
  });
});
