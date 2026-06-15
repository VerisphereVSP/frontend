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
// patch_bundle04_5_p41_NP_replay_buffer: cap on the dispatched-details replay buffer.
// Sized for a heavy session; eviction is FIFO. Correctness only needs the
// entry to survive long enough for a waitForTxConfirmation listener to
// attach and replay-request, typically <1s after submit.
const REPLAY_BUFFER_CAP = 200;

// patch_bundle04_5_p41_NP_replay_buffer: normalize tx_hash for consistent buffer keying.
// Mirrors the same fn in protocol/useTxConfirmation.ts; duplicated rather
// than imported to keep the protocol→frontend dependency uni-directional.
function normalizeHashLocal(s: string | null | undefined): string {
  if (!s) return "";
  let t = s.trim().toLowerCase();
  if (t.startsWith("0x")) t = t.slice(2);
  return t;
}
const READ_CURSOR_KEY = "verisphere:notifications:read_cursor";

export type TxStatus = "pending" | "confirmed" | "reverted" | "dropped";

// patch_bundle04_5_p363_source_id_keying — added source + source_id from patch 2 schema.
// id field kept for backwards compat; it is undefined for chain_tx
// and mm_trade rows in the unified feed. Do not use it as a key.
export interface TxRow {
  source?: "tx_log" | "chain_tx" | "mm_trade";
  source_id: number;
  id?: number;
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
  // patch_bundle04_5_p363_source_id_keying — key type widened to number | string to
  // accommodate namespaced chain_tx and mm_trade keys.
  const seenStatusRef = useRef<Map<number | string, TxStatus>>(new Map());
  // patch_bundle04_5_p36_dispatch_fastpath — first poll is a snapshot, so we do not fire
  // verisphere:tx-resolved for old already-confirmed rows on
  // page load. From the second poll onward, transitions and
  // first-time-seen-as-non-pending rows BOTH dispatch.
  const hasPolledBeforeRef = useRef<boolean>(false);
  // patch_bundle04_5_p41_NP_replay_buffer — replay buffer. The Set<string> dedup from
  // patch 4 is upgraded to a Map<normalizedHash, detail> so we can REPLAY
  // a previously-dispatched verisphere:tx-confirmed event to a late-attaching
  // waitForTxConfirmation listener (covers the race where the row resolved
  // before the listener attached).
  //
  // Key: normalized tx_hash (lower-case, no 0x prefix). Value: the same
  // detail payload we dispatch.
  //
  // Cap: REPLAY_BUFFER_CAP entries, FIFO eviction (Map preserves insertion
  // order). Cleared on wallet disconnect.
  const dispatchedDetailsRef = useRef<Map<string, any>>(new Map());
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
      // patch_bundle04_5_p363_source_id_keying
      const newSeen = new Map<number | string, TxStatus>();
      // patch_bundle04_5_p363_source_id_keying — row.id is undefined in the unified-feed
      // schema; use source_id (which IS the tx_log row id for
      // pending rows, since only tx_log emits "pending" status).
      for (const row of newPending) newSeen.set(row.source_id, "pending");
      for (const row of newRecent) {
        const st = (row.status || "confirmed") as TxStatus;
        // patch_bundle04_5_p363_source_id_keying — source-aware keys, integer for tx_log
        // (so it matches the listener filter in useMetaTx), namespaced
        // strings for chain_tx and mm_trade.
        const key: number | string =
          row.source === "tx_log" ? row.source_id
          : `${row.source}:${row.source_id}`;
        newSeen.set(key, st);
        const prior = prev.get(key);
        // patch_bundle04_5_p36_dispatch_fastpath — fire on either transition or fast-resolution
        // first-sight, but only after the first (snapshot) poll.
        const isResolved = st !== "pending";
        const newlyResolved =
          hasPolledBeforeRef.current &&
          (prior === "pending" || (prior === undefined && isResolved));
        if (newlyResolved) {
          // patch_bundle04_5_p4_NP_dispatch_by_hash: dispatch by tx_hash,
          // un-gated from source. tx_log row source_id IS the tx_log_id
          // (preserved for backwards-compat consumers); for chain_tx and
          // mm_trade source rows tx_log_id is left undefined.
          // patch_bundle04_5_p41_NP_replay_buffer: Map-based dedup + replay buffer.
          const txh = normalizeHashLocal(row.tx_hash);
          const alreadyDispatched = txh && dispatchedDetailsRef.current.has(txh);
          if (txh && !alreadyDispatched) {
            // Build the detail we will dispatch AND cache.
            const replayDetail = {
              tx_hash:       row.tx_hash,
              status:        st,
              block_number:  row.block_number,
              gas_used:      row.gas_used,
              post_id:       row.post_id,
              error_message: row.error_message,
              tx_log_id:     row.source === "tx_log" ? row.source_id : undefined,
            };
            // Cache before dispatch so a synchronous listener that re-enters
            // (unlikely but defensive) sees a consistent buffer state.
            dispatchedDetailsRef.current.set(txh, replayDetail);
            // FIFO eviction.
            if (dispatchedDetailsRef.current.size > REPLAY_BUFFER_CAP) {
              const oldest = dispatchedDetailsRef.current.keys().next().value;
              if (oldest !== undefined) dispatchedDetailsRef.current.delete(oldest);
            }
            // New primitive: keyed by tx_hash. The protocol package's
            // waitForTxConfirmation subscribes to this event.
            window.dispatchEvent(
              new CustomEvent("verisphere:tx-confirmed", { detail: replayDetail }),
            );
            // Existing event: kept for TransactionsView's refresh trigger.
            // Un-gated from source so MM trades and chain-only events also
            // refresh the view. Backward-compatible payload shape.
            window.dispatchEvent(
              new CustomEvent("verisphere:tx-resolved", {
                detail: {
                  tx_log_id:    row.source === "tx_log" ? row.source_id : undefined,
                  tx_hash:      row.tx_hash,
                  status:       st,
                  block_number: row.block_number,
                  gas_used:     row.gas_used,
                  post_id:      row.post_id,
                  error_message: row.error_message,
                  source:       row.source,
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
      }
      seenStatusRef.current = newSeen;
      hasPolledBeforeRef.current = true;  // patch_bundle04_5_p36_dispatch_fastpath

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
      // patch_bundle04_5_p41_NP_replay_buffer: clear per-wallet dispatch+replay buffer.
      dispatchedDetailsRef.current = new Map();
      setPending([]);
      setRecent([]);
      setUnreadCount(0);
      return;
    }
    // patch_NP_account_switch_snapshot: on ANY wallet change (including A->B,
    // not just disconnect) reset the per-wallet dispatch state so the new
    // wallet's first poll is a fresh snapshot and does NOT replay its
    // already-confirmed history as toasts. Without this, hasPolledBeforeRef
    // stays true across a switch, so every confirmed row satisfies
    // (prior === undefined && isResolved) and re-fires a toast.
    seenStatusRef.current = new Map();
    hasPolledBeforeRef.current = false;
    dispatchedDetailsRef.current = new Map();
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

  // patch_bundle04_5_p41_NP_replay_buffer: replay-request listener.
  // A waitForTxConfirmation listener that attaches AFTER the dispatch
  // for its hash already fired would otherwise time out. On a replay
  // request, re-dispatch the cached detail for that hash if we have one.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tx_hash?: string } | undefined;
      const key = normalizeHashLocal(detail?.tx_hash);
      if (!key) return;
      const cached = dispatchedDetailsRef.current.get(key);
      if (!cached) return;
      // Re-dispatch synchronously. The requesting listener is on the
      // bus by definition (it just dispatched the request).
      window.dispatchEvent(
        new CustomEvent("verisphere:tx-confirmed", { detail: cached }),
      );
    };
    window.addEventListener("verisphere:tx-confirmed-replay-request", handler);
    return () =>
      window.removeEventListener("verisphere:tx-confirmed-replay-request", handler);
  }, []);

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
