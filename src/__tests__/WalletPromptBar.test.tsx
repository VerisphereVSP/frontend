// patch_fe_gas_fee: the persistent "signature request waiting" bar and the fee line
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
// `screen` is not typed in this repo (no @testing-library/dom types on main — App.test has the same
// error); query through render()'s container instead so tsc stays at main's count.
import { render, act, cleanup } from "@testing-library/react";

afterEach(() => cleanup());  // no globals in this vitest config: unmount between tests
import WalletPromptBar from "../components/WalletPromptBar";
import TxProgress from "../components/article/TxProgress";

function prompt(detail: Record<string, unknown>) {
  act(() => { window.dispatchEvent(new CustomEvent("verisphere:wallet-prompt", { detail })); });
}

describe("WalletPromptBar", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); cleanup(); });

  it("is hidden until a request opens, shows the label and position, hides when it closes", () => {
    const { container } = render(<WalletPromptBar />);
    const bar = () => container.querySelector('[data-testid="wallet-prompt-bar"]');
    expect(bar()).toBeNull();
    prompt({ state: "open", label: "Sign the action — relay fee 0.3300 VSP", index: 2, count: 2 });
    expect(bar()?.textContent).toContain("Your wallet is waiting for you");
    expect(bar()?.textContent).toContain("2 of 2");
    expect(bar()?.textContent).toContain("relay fee 0.3300 VSP");
    expect(bar()?.textContent).not.toContain("Don't see it?");
    prompt({ state: "closed", label: "x", index: 2, count: 2 });
    expect(bar()).toBeNull();
  });

  it("tells the user where to look after 15 s", () => {
    const { container } = render(<WalletPromptBar />);
    prompt({ state: "open", label: "Allow relay fees", index: 1, count: 1 });
    act(() => { vi.advanceTimersByTime(15_100); });
    expect(container.querySelector('[data-testid="wallet-prompt-bar"]')?.textContent).toContain("Don't see it?");
  });
});

describe("TxProgress fee line", () => {
  it("shows the quoted fee once the action is in progress", () => {
    const { container } = render(<TxProgress />);
    act(() => {
      window.dispatchEvent(new CustomEvent("verisphere:tx-progress", {
        detail: { action: "start", title: "Updating Stake", steps: [{ label: "Set to 1.00 VSP support", status: "active" }] },
      }));
      window.dispatchEvent(new CustomEvent("verisphere:fee-quote", {
        detail: { available: true, fee_vsp: 0.3312, fee_usd: 0.0666, action_type: "stake" },
      }));
    });
    const fee = container.querySelector('[data-testid="tx-fee"]');
    expect(fee?.textContent).toContain("0.3312 VSP");
    expect(fee?.textContent).toContain("after the action confirms");
  });

  it("says so when the relay could not quote", () => {
    const { container } = render(<TxProgress />);
    act(() => {
      window.dispatchEvent(new CustomEvent("verisphere:tx-progress", { detail: { action: "start", title: "t", steps: [] } }));
      window.dispatchEvent(new CustomEvent("verisphere:fee-quote", { detail: { available: false } }));
    });
    expect(container.querySelector('[data-testid="tx-fee"]')?.textContent).toContain("quoted at submission");
  });
});
