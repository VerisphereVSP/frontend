// frontend/src/api/pool.ts — patch_trackb_fe_swap
// Client for GET /api/pool/price. Three-state contract (mirrors the backend):
//   200 {configured:false} -> pool era dark; render the legacy MM surface
//   200 {configured:true}  -> pool state; render the pool surface
//   503                    -> pool configured but read failed; render the pool
//                             surface in "unavailable" mode — NEVER the MM
//   404 / network error    -> old backend or backend down; legacy surface

export type PoolState = {
  configured: boolean;
  price_usdc_per_vsp?: number;
  vsp_reserve?: number;
  usdc_reserve?: number;
  vsp_circulating?: number;
  pair?: string;
  venue?: "mockcpamm" | "univ2";      // patch_venue
  router?: string | null;             // patch_venue: UniV2 router for in-app swaps
  token0_is_vsp?: boolean;            // patch_venue: pair orientation (univ2 sorts by address)
  swap_url?: string;
  updated_at?: number;
};

export type PoolProbe =
  | { kind: "pool"; state: PoolState }
  | { kind: "pool-unavailable" }
  | { kind: "mm" };

export async function probePool(): Promise<PoolProbe> {
  try {
    const r = await fetch("/api/pool/price");
    if (r.status === 503) return { kind: "pool-unavailable" };
    if (!r.ok) return { kind: "mm" }; // 404 = pre-pool backend
    const state: PoolState = await r.json();
    return state.configured ? { kind: "pool", state } : { kind: "mm" };
  } catch {
    return { kind: "mm" }; // backend unreachable — degrade to today's behavior
  }
}
