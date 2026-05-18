// frontend/src/notifications/NotificationsProvider.tsx
//
// Polls /api/notifications/{address} and dispatches window events
// when tx_log rows transition out of 'pending'. The protocol hooks
// listen for these events via the useMetaTx waitForTxResolution flow.
//
// Smart polling:
//   - When there are pending rows, poll every POLL_INTERVAL_FAST ms.
//   - When there are none, poll every POLL_INTERVAL_SLOW ms.
//   - On any `verisphere:notifications-refresh` window event, poll now.
//
// State exposed via context:
//   - pending: current pending tx_log rows for the connected wallet
//   - recent:  recently resolved rows (confirmed/reverted/dropped), capped
//   - unreadCount: number of rows resolved since the user last opened the panel
//   - markAllRead(): records the user has seen the panel (localStorage)
//
// Events dispatched (for non-React consumers):
//   verisphere:tx-resolved   { tx_log_id, tx_hash, status, ... }
//   verisphere:toast         { message, type }
//
// Events consumed:
//   verisphere:notifications-refresh   (forces immediate poll)
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { useAccount } from "wagmi";

const API_BASE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE) || "/api";

const POLL_INTERVAL_FAST_MS = 3_000;  // while any tx is pending
const POLL_INTERVAL_SLOW_MS = 30_000; // background

const RECENT_RETAIN = 50;
const READ_CURSOR_KEY = "verisphere:notifications:read_cursor";

export type TxStatus = "pending" | "confirmed" | "reverted" | "dropped";

export interface TxRow {
  id: number;
  tx_hash: string;
  action_type: string;
  action_value: number | null;
  to_address: string;
  post_id: number | null;
  submitted_at: string;
  resolved_at?: string | null;
  status?: TxStatus;
  block_number?: number | null;
  gas_used?: number | null;
  error_message?: string | null;
}

interface NotificationsContextValue {
  pending: TxRow[];
  recent: TxRow[];
  unreadCount: number;
  markAllRead: () => void;
  refreshNow: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  pending: [],
  recent: [],
  unreadCount: 0,
  markAllRead: () => {},
  refreshNow: () => {},
});

export function useNotifications() {
  return useContext(NotificationsContext);
}

function readCursor(): number {
  try {
    const v = localStorage.getItem(READ_CURSOR_KEY);
    if (!v) return 0;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeCursor(ts: number) {
  try {
    localStorage.setItem(READ_CURSOR_KEY, String(ts));
  } catch {
    // ignore
  }
}

function friendlyActionLabel(action: string): string {
  switch (action) {
    case "claim":   return "Claim";
    case "link":    return "Link";
    case "stake":   return "Stake";
    case "unstake": return "Unstake";
    case "approve": return "Approval";
    case "transfer":return "Transfer";
    default:        return action;
  }
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { address } = useAccount();
  const [pending, setPending] = useState<TxRow[]>([]);
  const [recent, setRecent] = useState<TxRow[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // Track previously-seen tx_log_ids by status, so we know when a row
  // transitions from pending → resolved and can dispatch the event.
  const seenStatusRef = useRef<Map<number, TxStatus>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addressRef = useRef<string | undefined>(undefined);
  addressRef.current = address;

  const poll = useCallback(async () => {
    const addr = addressRef.current;
    if (!addr) return;
    try {
      const res = await fetch(
        `${API_BASE}/notifications/${addr}?pending_limit=50&recent_limit=${RECENT_RETAIN}`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) return;
      const data = await res.json();
      const newPending: TxRow[] = data.pending || [];
      const newRecent: TxRow[] = data.recent || [];

      // Detect transitions: any row in seen as 'pending' that now appears
      // in `recent` with a non-pending status is newly resolved. Dispatch.
      const prev = seenStatusRef.current;
      const newSeen = new Map<number, TxStatus>();
      for (const row of newPending) newSeen.set(row.id, "pending");
      for (const row of newRecent) {
        const st = (row.status || "confirmed") as TxStatus;
        newSeen.set(row.id, st);
        const prior = prev.get(row.id);
        if (prior === "pending") {
          // Newly resolved.
          window.dispatchEvent(
            new CustomEvent("verisphere:tx-resolved", {
              detail: {
                tx_log_id:    row.id,
                tx_hash:      row.tx_hash,
                status:       st,
                block_number: row.block_number,
                gas_used:     row.gas_used,
                post_id:      row.post_id,
                error_message: row.error_message,
              },
            }),
          );
          // Surface a toast too.
          const label = friendlyActionLabel(row.action_type);
          if (st === "confirmed") {
            window.dispatchEvent(
              new CustomEvent("verisphere:toast", {
                detail: {
                  message: `${label} confirmed`,
                  type: "success",
                },
              }),
            );
          } else if (st === "reverted") {
            window.dispatchEvent(
              new CustomEvent("verisphere:toast", {
                detail: {
                  message: `${label} reverted` + (row.error_message ? `: ${row.error_message}` : ""),
                  type: "error",
                },
              }),
            );
          } else if (st === "dropped") {
            window.dispatchEvent(
              new CustomEvent("verisphere:toast", {
                detail: { message: `${label} dropped from mempool`, type: "error" },
              }),
            );
          }
        }
      }
      seenStatusRef.current = newSeen;

      setPending(newPending);
      setRecent(newRecent);

      // Recompute unread: rows resolved after the read cursor.
      const cursor = readCursor();
      const unread = newRecent.filter((r) => {
        if (!r.resolved_at) return false;
        const t = new Date(r.resolved_at).getTime();
        return Number.isFinite(t) && t > cursor;
      }).length;
      setUnreadCount(unread);
    } catch {
      // network error; quietly retry next cycle
    }
  }, []);

  // Schedule the next poll based on current pending state.
  const schedule = useCallback(
    (delayMs: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        await poll();
        // Re-schedule with fresh interval based on current pending count.
        // (We use a ref read because state updates are async; the next
        //  poll call will see the latest data on its own anyway.)
        const next = (seenStatusRef.current
          ? Array.from(seenStatusRef.current.values()).some((s) => s === "pending")
          : false)
          ? POLL_INTERVAL_FAST_MS
          : POLL_INTERVAL_SLOW_MS;
        schedule(next);
      }, delayMs);
    },
    [poll],
  );

  // Start/stop polling based on address presence.
  useEffect(() => {
    if (!address) {
      if (timerRef.current) clearTimeout(timerRef.current);
      seenStatusRef.current = new Map();
      setPending([]);
      setRecent([]);
      setUnreadCount(0);
      return;
    }
    // Immediate first poll.
    poll();
    schedule(POLL_INTERVAL_SLOW_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [address, poll, schedule]);

  // Listen for forced-refresh events.
  useEffect(() => {
    const handler = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      poll().then(() => schedule(POLL_INTERVAL_FAST_MS));
    };
    window.addEventListener("verisphere:notifications-refresh", handler);
    return () =>
      window.removeEventListener("verisphere:notifications-refresh", handler);
  }, [poll, schedule]);

  const markAllRead = useCallback(() => {
    writeCursor(Date.now());
    setUnreadCount(0);
  }, []);

  const refreshNow = useCallback(() => {
    window.dispatchEvent(new CustomEvent("verisphere:notifications-refresh"));
  }, []);

  return (
    <NotificationsContext.Provider
      value={{ pending, recent, unreadCount, markAllRead, refreshNow }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}
