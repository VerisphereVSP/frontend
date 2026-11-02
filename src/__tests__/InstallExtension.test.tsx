// patch_fe_install_ext: the install button shows only where the Web Store exists, hides when the extension is present,
// and counts its tap anonymously.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, cleanup, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import InstallExtension, { canInstallExtension, STORE_URL } from "../components/InstallExtension";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete document.documentElement.dataset.verisphereExt; });

describe("InstallExtension", () => {
  it("knows where the store exists", () => {
    expect(canInstallExtension(CHROME)).toBe(true);
    expect(canInstallExtension(CHROME.replace("Safari/537.36", "Safari/537.36 Edg/130.0.0.0"))).toBe(true);
    expect(canInstallExtension("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36")).toBe(false);
    expect(canInstallExtension("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(canInstallExtension("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15")).toBe(false);
    expect(canInstallExtension("Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0")).toBe(false);
  });

  it("shows on desktop Chromium, counts the tap, opens the store", async () => {
    vi.stubGlobal("navigator", { ...navigator, userAgent: CHROME, sendBeacon: vi.fn(() => true) });
    const open = vi.fn(); vi.stubGlobal("open", open);
    render(<InstallExtension where="start" />);
    await waitFor(() => screen.getByTestId("install-ext-start"));
    await act(async () => { screen.getByTestId("install-ext-start").click(); });
    expect(open).toHaveBeenCalledWith(STORE_URL, "_blank", "noopener");
    const beacon = (navigator as any).sendBeacon as ReturnType<typeof vi.fn>;
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe("/api/funnel");
  });

  it("stays hidden on phones and when the extension marked the page", async () => {
    vi.stubGlobal("navigator", { ...navigator, userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130.0.0.0 Mobile Safari/537.36" });
    render(<InstallExtension where="a" />);
    expect(screen.queryByTestId("install-ext-a")).toBeNull();
    cleanup();
    vi.stubGlobal("navigator", { ...navigator, userAgent: CHROME });
    document.documentElement.dataset.verisphereExt = "0.1.4";
    render(<InstallExtension where="b" />);
    expect(screen.queryByTestId("install-ext-b")).toBeNull();
  });

  it("is mounted on the Start sheet's done screen and in the footer", () => {
    const so = readFileSync(resolve(process.cwd(), "src/components/StartOverlay.tsx"), "utf8");
    expect(so).toContain('<InstallExtension where="start" />');
    const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    expect(app).toContain('<InstallExtension variant="link" where="footer" />');
  });
});
