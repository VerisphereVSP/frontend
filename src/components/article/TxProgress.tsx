// frontend/src/components/article/TxProgress.tsx
// Persistent overlay that shows multi-step transaction progress.
// Listens for verisphere:tx-progress custom events dispatched by hooks.
import { useState, useEffect } from "react";
import { C } from "./theme";

export type TxStep = {
  label: string;
  status: "pending" | "active" | "done" | "error";
};

type ProgressState = {
  visible: boolean;
  title: string;
  steps: TxStep[];
  error: string | null;
  // patch_fe_gas_fee: the relay's fee for this action, quoted from gas before signing
  fee: { fee_vsp: number; fee_usd: number } | null | "unavailable";
};

const INITIAL: ProgressState = {
  visible: false,
  title: "",
  steps: [],
  error: null,
  fee: null,
};

// Auto-dismiss delay after completion (ms)
const DISMISS_DELAY = 3000;

export function fireTxProgress(detail: {
  action: "start" | "step" | "done" | "error" | "dismiss";
  title?: string;
  steps?: TxStep[];
  stepIndex?: number;
  error?: string;
}) {
  window.dispatchEvent(
    new CustomEvent("verisphere:tx-progress", { detail }),
  );
}

export default function TxProgress() {
  const [state, setState] = useState<ProgressState>(INITIAL);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;

      switch (detail.action) {
        case "start":
          setState({
            visible: true,
            title: detail.title || "Processing…",
            steps: detail.steps || [],
            error: null,
            fee: null,
          });
          break;

        case "step":
          setState((prev) => {
            if (!prev.visible) return prev;
            const steps = [...prev.steps];
            if (detail.stepIndex != null && steps[detail.stepIndex]) {
              // Mark previous steps done
              for (let i = 0; i < detail.stepIndex; i++) {
                if (steps[i].status === "active") steps[i].status = "done";
              }
              steps[detail.stepIndex].status = "active";
            }
            return { ...prev, steps };
          });
          break;

        case "done":
          setState((prev) => {
            if (!prev.visible) return prev;
            const steps = prev.steps.map((s) => ({
              ...s,
              status: s.status === "error" ? s.status : ("done" as const),
            }));
            return { ...prev, steps, error: null };
          });
          // Auto-dismiss
          setTimeout(() => {
            setState((prev) => (prev.error ? prev : INITIAL));
          }, DISMISS_DELAY);
          break;

        case "error":
          setState((prev) => ({
            ...prev,
            error: detail.error || "Transaction failed",
            steps: prev.steps.map((s) =>
              s.status === "active" ? { ...s, status: "error" as const } : s,
            ),
          }));
          break;

        case "dismiss":
          setState(INITIAL);
          break;
      }
    };

    // patch_fe_gas_fee: the quote arrives from useMetaTx once per action
    const feeHandler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d) return;
      setState((prev) =>
        prev.visible
          ? { ...prev, fee: d.available ? { fee_vsp: d.fee_vsp, fee_usd: d.fee_usd } : "unavailable" }
          : prev,
      );
    };
    window.addEventListener("verisphere:tx-progress", handler);
    window.addEventListener("verisphere:fee-quote", feeHandler);
    return () => {
      window.removeEventListener("verisphere:tx-progress", handler);
      window.removeEventListener("verisphere:fee-quote", feeHandler);
    };
  }, []);

  if (!state.visible) return null;

  const allDone = state.steps.every(
    (s) => s.status === "done" || s.status === "error",
  );

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 9999,
        background: "#fff",
        border: `1px solid ${C.gb}`,
        borderRadius: 10,
        boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
        padding: "12px 16px",
        minWidth: 260,
        maxWidth: 360,
        fontSize: 13,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span style={{ fontWeight: 700, color: C.text }}>{state.title}</span>
        <span
          onClick={() => setState(INITIAL)}
          style={{
            cursor: "pointer",
            color: C.muted,
            fontSize: 15,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          ✕
        </span>
      </div>

      {/* Steps */}
      {state.steps.map((step, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "3px 0",
            color:
              step.status === "done"
                ? C.green
                : step.status === "active"
                  ? C.blue
                  : step.status === "error"
                    ? C.red
                    : C.muted,
          }}
        >
          <span style={{ fontSize: 14, width: 18, textAlign: "center" }}>
            {step.status === "done"
              ? "✓"
              : step.status === "active"
                ? "◉"
                : step.status === "error"
                  ? "✗"
                  : "○"}
          </span>
          <span
            style={{
              fontWeight: step.status === "active" ? 600 : 400,
              fontSize: 12,
            }}
          >
            {step.label}
            {step.status === "active" && (
              <span style={{ color: C.muted, marginLeft: 4 }}>
                (sign in wallet)
              </span>
            )}
          </span>
        </div>
      ))}

      {/* patch_fe_gas_fee: the fee the user pays for this action — the relay's gas cost in VSP, quoted before signing */}
      {state.fee && (
        <div data-testid="tx-fee" style={{ marginTop: 6, fontSize: 11, color: C.muted, borderTop: `1px solid ${C.gb}`, paddingTop: 5 }}>
          {state.fee === "unavailable"
            ? "Relay fee: quoted at submission"
            : <>Relay fee: <b style={{ color: C.text }}>{state.fee.fee_vsp.toFixed(4)} VSP</b> (≈ ${state.fee.fee_usd.toFixed(3)}, taken after the action confirms)</>}
        </div>
      )}

      {/* Error */}
      {state.error && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: C.red,
            background: "rgba(220,50,50,0.05)",
            padding: "4px 6px",
            borderRadius: 4,
          }}
        >
          {state.error}
        </div>
      )}

      {/* Success message */}
      {allDone && !state.error && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: C.green,
            fontWeight: 600,
          }}
        >
          Complete!
        </div>
      )}
    </div>
  );
}
