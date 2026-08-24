// frontend/src/components/MarketWidget.tsx — patch_trackb_fe_swap
// The trade-surface router (Track B). Probes /api/pool/price once at mount:
//   pool configured  -> PoolMarketWidget (public-AMM era)
//   dark / 404 / down -> legacy VSPMarketWidget (exactly today's behavior)
//   503              -> PoolMarketWidget in unavailable mode (never MM fallback)
import { useEffect, useState } from "react";
import VSPMarketWidget from "./VSPMarketWidget";
import PoolMarketWidget from "./PoolMarketWidget";
import { probePool, PoolProbe } from "../api/pool";

export default function MarketWidget() {
  const [probe, setProbe] = useState<PoolProbe | null>(null);

  useEffect(() => {
    let alive = true;
    probePool().then((p) => {
      if (alive) setProbe(p);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (probe === null) return null; // one probe-length flicker beats a wrong surface
  if (probe.kind === "pool") return <PoolMarketWidget initial={probe.state} />;
  if (probe.kind === "pool-unavailable") return <PoolMarketWidget initial={null} />;
  return <VSPMarketWidget />;
}
