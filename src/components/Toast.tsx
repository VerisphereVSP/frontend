// frontend/src/components/Toast.tsx
// Lightweight toast notification system.
// Usage: const { toast } = useToast();
//        toast("Claim created successfully", "success");
//        toast("Transaction failed", "error");

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";

// patch_toast_warning_fix: include "warning" — protocol hooks dispatch it
type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, type }]);
    // Start exit animation after 3.5s, remove after 4s
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
      );
    }, 3500);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // patch_fe_gas_fee: while a wallet signature request is open (WalletPromptBar),
  // hold informational toasts and show them once it resolves — a toast landing
  // on top of the progress box while the user hunts for the MetaMask window was
  // the "lost behind toast" complaint. Errors always show.
  const [promptOpen, setPromptOpen] = useState(false);
  const [held, setHeld] = useState<{ message: string; type: ToastType }[]>([]);
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d) return;
      setPromptOpen(d.state === "open");
    };
    window.addEventListener("verisphere:wallet-prompt", handler);
    return () => window.removeEventListener("verisphere:wallet-prompt", handler);
  }, []);
  useEffect(() => {
    if (promptOpen || held.length === 0) return;
    held.forEach((h) => toast(h.message, h.type));
    setHeld([]);
  }, [promptOpen, held, toast]);

  // Listen for custom toast events (from protocol hooks that can't use React context)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.message) {
        const type: ToastType = detail.type || "info";
        if (promptOpen && type !== "error") setHeld((prev) => [...prev, { message: detail.message, type }]);
        else toast(detail.message, type);
      }
    };
    window.addEventListener("verisphere:toast", handler);
    return () => window.removeEventListener("verisphere:toast", handler);
  }, [toast, promptOpen]);

  const colors: Record<ToastType, { bg: string; border: string; icon: string }> = {
    success: { bg: "#059669", border: "#047857", icon: "✓" },
    error:   { bg: "#dc2626", border: "#b91c1c", icon: "✗" },
    info:    { bg: "#3b82f6", border: "#2563eb", icon: "ℹ" },
    warning: { bg: "#d97706", border: "#b45309", icon: "⚠" },
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container — fixed bottom-LEFT (patch_fe_gas_fee: the progress box owns bottom-right) */}
      <div
        style={{
          position: "fixed",
          bottom: 20,
          left: 20,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => {
          // patch_toast_warning_fix: defensive fallback if a caller dispatches
          // an unrecognized type via the verisphere:toast event (typed any).
          const c = colors[t.type] ?? colors.info;
          return (
            <div
              key={t.id}
              style={{
                pointerEvents: "auto",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 16px",
                borderRadius: 8,
                background: c.bg,
                border: `1px solid ${c.border}`,
                color: "#fff",
                fontSize: 13,
                fontWeight: 500,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                maxWidth: 360,
                opacity: t.exiting ? 0 : 1,
                transform: t.exiting ? "translateX(20px)" : "translateX(0)",
                transition: "opacity 0.3s, transform 0.3s",
                animation: "toast-slide-in 0.3s ease-out",
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{c.icon}</span>
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes toast-slide-in {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
