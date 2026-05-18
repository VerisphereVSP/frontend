// frontend/src/notifications/NotificationsBell.tsx
//
// A bell icon with an unread-count badge. Click to open a dropdown
// listing pending + recent notifications. Closes on outside click.
//
// No fancy styling — inline styles to match the existing codebase
// pattern. Uses the same color palette as TxProgress / Toast.
import { useEffect, useRef, useState } from "react";
import { useNotifications, type TxRow } from "./NotificationsProvider";

const COLORS = {
  text:   "#111827",
  muted:  "#6b7280",
  border: "#e5e7eb",
  bg:     "#ffffff",
  hover:  "#f3f4f6",
  blue:   "#2563eb",
  green:  "#059669",
  red:    "#dc2626",
  amber:  "#d97706",
};

function statusIcon(status: string): { icon: string; color: string } {
  switch (status) {
    case "confirmed": return { icon: "✓",  color: COLORS.green };
    case "reverted":  return { icon: "✗",  color: COLORS.red };
    case "dropped":   return { icon: "⊘",  color: COLORS.amber };
    case "pending":   return { icon: "…",  color: COLORS.blue };
    default:          return { icon: "•",  color: COLORS.muted };
  }
}

function friendlyAction(action: string): string {
  switch (action) {
    case "claim":   return "Created claim";
    case "link":    return "Created link";
    case "stake":   return "Staked";
    case "unstake": return "Unstaked";
    case "approve": return "Token approval";
    case "transfer":return "Token transfer";
    default:        return action;
  }
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60)       return `${sec}s ago`;
  if (sec < 3600)     return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400)    return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function NotificationItem({ row }: { row: TxRow }) {
  const status = row.status || "pending";
  const { icon, color } = statusIcon(status);
  const action = friendlyAction(row.action_type);
  const ts = row.resolved_at || row.submitted_at;
  const sub: string[] = [];
  if (row.post_id != null) sub.push(`post #${row.post_id}`);
  if (row.action_value != null && row.action_value > 0) {
    sub.push(`${row.action_value.toFixed(2)} VSP`);
  }
  if (status === "reverted" && row.error_message) {
    sub.push(row.error_message);
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "8px 10px",
        borderBottom: `1px solid ${COLORS.border}`,
        fontSize: 12,
      }}
    >
      <span
        style={{
          color,
          fontSize: 14,
          fontWeight: 700,
          width: 16,
          textAlign: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: COLORS.text, fontWeight: 600 }}>
          {action} <span style={{ color: COLORS.muted, fontWeight: 400 }}>{status}</span>
        </div>
        {sub.length > 0 && (
          <div
            style={{
              color: COLORS.muted,
              fontSize: 11,
              marginTop: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={sub.join(" · ")}
          >
            {sub.join(" · ")}
          </div>
        )}
        <div style={{ color: COLORS.muted, fontSize: 10, marginTop: 2 }}>
          {timeAgo(ts)}
        </div>
      </div>
    </div>
  );
}

export default function NotificationsBell() {
  const { pending, recent, unreadCount, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const handleOpen = () => {
    setOpen((o) => {
      const next = !o;
      if (next) markAllRead();
      return next;
    });
  };

  const totalRows = pending.length + recent.length;

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={handleOpen}
        aria-label="Notifications"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 6,
          position: "relative",
          fontSize: 18,
          color: COLORS.text,
          lineHeight: 1,
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              background: COLORS.red,
              color: "#fff",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              padding: "1px 5px",
              minWidth: 16,
              textAlign: "center",
              lineHeight: "12px",
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 6,
            width: 340,
            maxHeight: 400,
            overflowY: "auto",
            background: COLORS.bg,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              borderBottom: `1px solid ${COLORS.border}`,
              fontSize: 12,
              fontWeight: 700,
              color: COLORS.text,
              background: "#fafafa",
            }}
          >
            Transactions
          </div>
          {totalRows === 0 ? (
            <div
              style={{
                padding: "16px 12px",
                fontSize: 12,
                color: COLORS.muted,
                textAlign: "center",
              }}
            >
              No transactions yet
            </div>
          ) : (
            <>
              {pending.map((row) => (
                <NotificationItem key={`p-${row.id}`} row={{ ...row, status: "pending" }} />
              ))}
              {recent.map((row) => (
                <NotificationItem key={`r-${row.id}`} row={row} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
