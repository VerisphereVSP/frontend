// @vitest-environment node
// patch_fe_mobile_shell: the shell rules that keep phones from widening the layout viewport (file-level checks; the
// behaviour itself was measured in Chromium's Pixel 7 emulation: innerWidth stayed 412 on landing, connected, Claims
// and Positions, where it had grown to 477 before).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("mobile shell", () => {
  const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
  const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  it("the shell is the viewport's height and never scrolls sideways", () => {
    expect(css).toMatch(/html, body \{ overflow-x: hidden; \}/);
    expect(css).toMatch(/\.app-shell \{[^}]*height: 100dvh/);
    expect(app).toContain('<div className="app-shell">');
    expect(app).not.toContain('height: "100vh"');
  });
  it("the header's brand + nav group wraps and inputs cap at the viewport", () => {
    expect(css).toMatch(/\.brand-nav \{[^}]*flex-wrap: wrap/);
    expect(css).toMatch(/\.top-nav \{[^}]*flex-wrap: wrap/);
    expect(app).toContain('<div className="brand-nav">');
    expect(app).toContain('<nav className="top-nav">');
    expect(css).toMatch(/input, select, textarea \{ max-width: 100%/);
  });
});
