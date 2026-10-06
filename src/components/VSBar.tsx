// Verity Score color bar — green for positive, red for negative, gray for zero.
//
// patch_fe_gauge_label: the label is always centred on the bar and always legible, whatever the
// bar's width or the fill's extent. The previous inside/outside rule put the label on the unfilled
// side when the fill was narrow and inside the fill when it was wide; a 40px inline bar at VS −100%
// had no unfilled side left, so the label sat in red on red (the article's disputed line showed a
// bare bar), and a 60px table bar at ±50% had neither 44px of fill nor 44px of free space, so the
// label clipped. Now the label is drawn twice, each copy clipped to its own region: white over the
// fill, dark over the background — so where it straddles the fill's edge it is two-tone and crisp.
// The decimal is dropped only when the one-decimal form does not fit the bar's width.
export default function VSBar({ vs, width = 56, height = 20 }: { vs: number; width?: number; height?: number }) {
  const clamped = Math.max(-100, Math.min(100, vs));
  const absVs = Math.abs(clamped);
  const isPos = clamped > 0;
  const isNeg = clamped < 0;
  const fillPct = Math.max(absVs, 2);
  const green = "#16a34a";
  const red = "#dc2626";
  const gray = "#d1d5db";
  const fillColor = isPos ? green : isNeg ? red : gray;
  const fontSize = height > 16 ? 10 : 9;
  const sign = clamped > 0 ? "+" : "";
  // Pick the most precise label that fits: bold digits at this size are ~0.62em wide; keep 3px each side.
  const fits = (s: string) => s.length * fontSize * 0.62 <= width - 6;
  const oneDecimal = `${sign}${clamped.toFixed(1)}%`;
  const integer = `${sign}${Math.round(clamped)}%`;
  const label = fits(oneDecimal) ? oneDecimal : integer;
  // The fill grows from the left for support and from the right for challenge. Clip the white copy
  // to the fill and the dark copy to the rest; a zero score has no fill, so only the dark copy shows.
  const rest = `${100 - fillPct}%`;
  const onFill = clamped === 0 ? "inset(0 100% 0 0)" : isPos ? `inset(0 ${rest} 0 0)` : `inset(0 0 0 ${rest})`;
  const offFill = clamped === 0 ? "inset(0)" : isPos ? `inset(0 0 0 ${fillPct}%)` : `inset(0 ${fillPct}% 0 0)`;
  const labelStyle = {
    position: "absolute" as const, top: 0, bottom: 0, left: 0, right: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize, fontWeight: 600, letterSpacing: -0.2,
    fontVariantNumeric: "tabular-nums" as const,
    zIndex: 1, userSelect: "none" as const, whiteSpace: "nowrap" as const,
  };
  return (
    <div
      style={{
        width, height, borderRadius: 3, background: "#f3f4f6",
        position: "relative", overflow: "hidden",
        border: "1px solid #e5e7eb", flexShrink: 0,
      }}
      title={`VS: ${oneDecimal}`}
    >
      <div
        style={{
          position: "absolute", top: 0,
          left: isNeg ? undefined : 0,
          right: isNeg ? 0 : undefined,
          width: `${fillPct}%`, height: "100%",
          background: fillColor, borderRadius: 2,
          transition: "width 0.3s ease",
        }}
      />
      <div style={{ ...labelStyle, color: "#111827", clipPath: offFill }}>{label}</div>
      <div style={{ ...labelStyle, color: "#fff", clipPath: onFill }} aria-hidden="true">{label}</div>
    </div>
  );
}
