// frontend/src/components/InstallExtension.tsx — patch_fe_install_ext (extension 0.1.4)
// One button that offers the browser extension where it can actually be installed: desktop Chromium (Chrome, Brave,
// Edge), and not when the extension is already there (its content script marks the app's pages). The tap is counted
// as a funnel step; nothing else is recorded.
import { useEffect, useState } from "react";
import { track } from "../funnel";

export const STORE_URL = "https://chromewebstore.google.com/detail/hlpjnfmmhgccpnnildibenneggffkbok";

/** Desktop Chromium only: the Web Store install exists nowhere else. */
export function canInstallExtension(ua: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): boolean {
  if (!/Chrome\/\d+/.test(ua)) return false;
  if (/Mobile|Android|iPhone|iPad|CriOS|FxiOS|OPR\/|SamsungBrowser/.test(ua)) return false;
  return true;
}

export function extensionInstalled(): boolean {
  try { return !!document.documentElement.dataset.verisphereExt; } catch { return false; }
}

export default function InstallExtension({ variant = "button", where }: { variant?: "button" | "link"; where: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!canInstallExtension()) return;
    // the marker is set at document_start, before this runs; one re-check covers a slow extension start
    if (extensionInstalled()) return;
    setShow(true);
    const t = setTimeout(() => { if (extensionInstalled()) setShow(false); }, 1500);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  const go = () => { track("ext_install_tap"); window.open(STORE_URL, "_blank", "noopener"); };
  if (variant === "link") {
    return <a data-testid={`install-ext-${where}`} href={STORE_URL} target="_blank" rel="noopener" onClick={(e) => { e.preventDefault(); go(); }}>Get the extension</a>;
  }
  return (
    <button type="button" data-testid={`install-ext-${where}`} onClick={go}
      style={{ padding: "12px 16px", borderRadius: 999, border: "1px solid #D9D4F0", background: "#fff", color: "#37299B", font: "600 15px system-ui, sans-serif", cursor: "pointer" }}
      title="Select any sentence on any site, right-click, Check on Verisphere">
      Check any claim you read: add the extension
    </button>
  );
}
