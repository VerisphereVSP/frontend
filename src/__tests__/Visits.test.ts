// patch_fe_visits: the app reports one anonymous visit per browser session, with the link's source tag if it has one.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { trackVisit, sourceTag } from "../funnel";

const readBlob = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(b); });  // jsdom's Blob has no .text()
const sent = (beacon: ReturnType<typeof vi.fn>) => Promise.all(beacon.mock.calls.map(async (c) => JSON.parse(await readBlob(c[1] as Blob))));

describe("visit count (patch_fe_visits)", () => {
  let beacon: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    window.sessionStorage.clear();
    beacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    window.history.replaceState({}, "", "/claims");
  });

  it("counts once per browser session and sends only the step", async () => {
    trackVisit(); trackVisit(); trackVisit();
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe("/api/funnel");
    expect(await sent(beacon)).toEqual([{ step: "app_visit" }]);
  });

  it("carries the source tag from the address", async () => {
    window.history.replaceState({}, "", "/claims?post=11&src=FB");
    trackVisit();
    expect(await sent(beacon)).toEqual([{ step: "app_visit", src: "fb" }]);
  });

  it("accepts only a short tag as a source", () => {
    expect(sourceTag("?src=lw-essay_1")).toBe("lw-essay_1");
    for (const bad of ["", "?src=", "?src=a%20b", "?src=<x>", "?src=" + "x".repeat(25), "?src=-a", "?src=0x5B43f0c1a2b3c4d5e6f7a8b9c0d1e2f3a4b5862b", "?code=VSP-AAAA"]) {
      expect(sourceTag(bad)).toBeNull();
    }
  });
});
