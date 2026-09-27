# Verisphere: A Truth-Staking Protocol
### White Paper — v17.0 (September 2026)
**Date:** September 2026
**Contact:** info@verisphere.co

> **Scope.** This paper describes the Verisphere **protocol** only: the on-chain
> smart contracts in `core/`. It does not describe, and makes no representations
> about, any application, website, relay, market maker, pricing mechanism, or
> token-purchase service that any party (including Verisphere Corp.) may build on
> top of the protocol. Those are separate services governed by their own terms.
> The protocol does not set, guarantee, or defend any market price for VSP.

---

## Abstract

Verisphere is a decentralized protocol for economically evaluating factual claims. Any participant may publish a claim on-chain and any participant may stake tokens to support or challenge it. Claims accumulate a Verity Score derived from the ratio and magnitude of stakes on each side. Evidence links between claims propagate truth-pressure through a directed graph, creating an interconnected epistemic structure where the credibility of each claim depends on the credibility of its evidence.

The protocol operates on the Avalanche C-Chain using the VSP ERC-20 token. All scoring, staking, and evidence-linking logic is implemented in upgradeable Solidity contracts. The protocol is permissionless: any front-end, API, or automated agent may interact with the on-chain contracts directly.

**The protocol does not adjudicate truth.** It has no oracle, no arbiter, and no privileged notion of what is true. Anyone may publish any assertion, however false, and anyone may stake for or against it. The protocol's only function is to make a position *cost something* when others are willing to stake against it: being wrong is expensive **only to the extent that other participants pay to make it so**. Verisphere does not decide what is true — it provides a transparent market in which participants attach their own economic conviction to claims, and it reports the running result.

---

## 1. Motivation

Existing information systems lack a mechanism for attaching economic cost to factual assertions. Search engines rank by engagement. Social platforms rank by virality. Encyclopedias rely on editorial consensus. Prediction markets handle binary, terminal events but cannot evaluate persistent, evolving claims such as "nuclear energy is environmentally sustainable" or "dietary saturated fat increases cardiovascular risk."

Verisphere addresses this gap by introducing a protocol where:

- Publishing a claim requires burning a fee, eliminating zero-cost spam.
- Supporting or challenging a claim requires staking tokens, imposing a cost on both truthful and untruthful assertions.
- Correct positions accrue value over time; incorrect positions lose it.
- Evidence relationships between claims are first-class on-chain objects with their own stake and credibility.

The protocol does not determine truth. It creates economic pressure that makes being wrong expensive and being right profitable, and it makes the resulting score transparent and auditable.

---

## 2. Protocol Overview

### 2.1 Posts

The atomic unit of the protocol is a **post**. Posts are of two types:

- **Claims**: standalone factual assertions (e.g., "Earth's mean radius is approximately 6,371 kilometers").
- **Links**: directed evidence relationships between two claims, annotated as either support or challenge.

Each post is identified by a sequential post ID. Post IDs begin at 1; zero is reserved as a null sentinel. Posts are immutable once created.

### 2.2 Claims

A claim is a single factual assertion stored as a UTF-8 string on-chain. Claims are deduplicated via case-insensitive, whitespace-normalized hashing (lowercase ASCII, collapse whitespace, trim, then keccak256). Attempting to create a duplicate claim reverts with `DuplicateClaim(existingPostId)`.

Publishing a claim requires transferring a posting fee of 1 VSP to the protocol, which burns it. The fee amount is governance-configurable.

### 2.3 Links

A link is a directed edge from one claim to another, annotated as either **support** or **challenge**. The direction is `from → to`, where "from" is the claim providing evidence and "to" is the claim receiving evidence.

Example: if claim S ("Earth is a spheroid") challenges claim F ("Earth is flat"), the link is `S → F` with `isChallenge = true`. This means S is the evidence provider and F is the evidence receiver.

Links are also posts and carry their own post ID, staking pool, and Verity Score. Duplicate links (same from, to, and challenge flag) are rejected. Self-loops are rejected.

The link graph permits cycles structurally. Two claims may challenge each other simultaneously. Cycles are not prevented at write time by the `LinkGraph` contract; instead, cycle handling occurs at score computation time in the `ScoreEngine` (see Section 4.3).

Creating a link also requires the posting fee, which is burned.

---

## 3. Staking

### 3.1 Positional Staking

Any participant may stake VSP tokens on any post (claim or link), but only on **one side** of any given post. A user with an existing support stake on a post cannot add a challenge stake to the same post (the contract reverts with `OppositeSideStaked`); they must withdraw fully and re-enter on the other side.

Each (post, side) pair holds at most **one consolidated lot per user**. A user's first stake on a side creates the lot at the back of the queue. Subsequent stakes by the same user on the same side merge into the existing lot: the lot's `amount` grows by the additional stake, and after every queue mutation the StakeEngine recomputes every lot's `weightedPosition` as the midpoint of its share of the side total — `weightedPosition = cumBefore + amount / 2`, where `cumBefore` is the running sum of amounts of lots earlier in the array. Earlier-entered users keep their array slot, but added stake does not inherit the slot's earliness: on a top-up, the added capital enters at the tail midpoint (`sideTotal + added / 2`), and the lot's `weightedPosition` becomes the amount-weighted average of its tranches' entry positions. A lot therefore earns as if each unit of its capital had queued when it actually arrived — a small early stake cannot buy a front-row position for capital added later. (Implementation: a per-lot offset added to the natural midpoint during recompute; when capital ahead of a lot withdraws, the blended lot moves forward as one, a second-order effect bounded by the earliest tranche's share.)

Stakes may be withdrawn at any time, in any amount up to the user's current lot balance. After a withdrawal, the StakeEngine recomputes every lot's `weightedPosition` from the new amounts, so a partial withdrawal slightly shifts the staker (and everyone after them in the array) toward the front of the queue. A user who withdraws fully retains their array slot with `amount = 0` (a "ghost lot"), which can be removed by a governance call to `compactLots`. A `lifo` parameter exists on the `withdraw` function for ABI compatibility but is ignored.

### 3.2 Staking Rate

Each lot accrues or loses value once per snapshot period (default: one day), **prorated by the share of the settlement window it was present for**: a lot that entered partway through the window earns or loses `delta × present / windowLength`. A lot's entry time is amount-weighted across top-ups (an addition ages the lot toward "now" in proportion to its size), so capital added seconds before a boundary earns seconds' worth, and a stake earns from the moment it is placed rather than from the next boundary. The rate itself is determined by:

1. **Truth pressure** — the verity magnitude is taken from the post's **effective pool** (Section 4.2.3): `verity = |S − C| / (S + C)`, where `S` is direct support plus incoming evidence in support and `C` is direct challenge plus incoming evidence against. The side that accrues is the side the effective pool favors (`S > C` → support). Evidence therefore moves money: a claim whose credible evidence outweighs its direct support pays its challengers and decays its supporters, whatever the direct stake ratio. When the effective pool is balanced (`S = C`), no economic effect occurs.
2. **Post size (participation)** — the post's **direct** total stake relative to a global reference (`sMax`) scales the rate: `participation = T / sMax` with `T = A + D`. Evidence changes which side wins and by how much, not how large the post is.
3. **Position weight** — each lot's weight is a continuous function of its weighted position in its side queue: `positionWeight = 1 − (lot.weightedPosition / sideTotal)`. Because positions are midpoints, a sole staker on a side has `weightedPosition = amount / 2` and therefore `positionWeight = 1/2`; the first of many earlier stakers (those with small `cumBefore`) earns close to the full rate, while later additions earn proportionally less.
4. **Governed bounds** — the annual rate is bounded between `rMin` and `rMax`, both governance-configurable. The current deployment uses 0% minimum and a maximum of 100% APY compounded daily (`rMax = 365 × (2^(1/365) − 1) ≈ 0.6938` as a simple annual rate; a lot at full verity, participation and position weight doubles in a year when settled every epoch).

The base per-epoch rate (in RAY units, where RAY = 1e18) is:

```
rBase = rMin + (rMax − rMin) × verity × participation
```

Where `verity = |S − C| × RAY / (S + C)` over the effective pool and both `rMin` and `rMax` have already been scaled from annual to per-epoch by the elapsed time (`× EPOCH_LENGTH × epochsElapsed / YEAR_LENGTH`). Catch-up settlement over several elapsed epochs applies the scaled rate once, without compounding; a post settled every epoch compounds daily.

**Settlement reads the graph live.** A post's effective pool is computed at the moment it settles, from the current state of its ancestors (Section 4.2), with all stake quantities time-weighted over the settlement window. There is no cached score and no scheduled snapshot that could be timed against. Because the computation walks the post's ancestry, a settlement may exceed the gas a user transaction carries; in that case `stake()`/`withdraw()` revert with `SettleFirst(postId)` and the post is settled by the permissionless `updatePost()` (a keeper runs a settlement pass each epoch, parents before children). Settlement never falls back to the direct ratio and never uses a stale value. Contributions cut by the cycle rule or the depth limit (Section 4.3) are zero *by definition* and settle as such; a post's pool is deterministic for that post, so a cycle anywhere above it can never prevent it from settling.

Each lot's per-epoch change is then computed independently — there is no side-wide budget redistribution. For each lot:

```
delta = lot.amount × rBase × positionWeight / RAY
```

For a lot on the side aligned with the VS sign, `delta` accrues (VSP is minted to the StakeEngine and added to the lot). For a lot on the opposing side, `delta` is burned (VSP is destroyed and subtracted from the lot, capped so the lot never goes below zero). Because `positionWeight ∈ [0, 1]`, an individual lot's effective rate never exceeds `rBase`; a sole staker on a side earns `rBase / 2`.

**Position bounds.** Positions are recomputed from the current amounts after every queue mutation (there is no post-snapshot rescale), and a blended position is clamped so that no lot ever sits behind the tail of its side (`weightedPosition ≤ sideTotal − amount / 2`); `positionWeight` therefore never clamps to zero for a live lot.

The global reference `sMax` is maintained by a tracker of the ten largest active posts, fed by **settled totals**: a post's total enters the tracker when the post settles (at the start of its settlement, so the settling post is scored against the correct `sMax`), not at stake time. Capital that enters and exits a post inside a single epoch never survives to a settlement and therefore never registers — a flash stake cannot move `sMax`. When a settling post's total exceeds the current `sMax`, `sMax` rises to that total at that settlement. `sMax` never snaps downward: when the largest tracked total falls below it — through withdrawals or decay — `sMax` converges toward the current largest total by exponential decay (configurable; currently 10% per epoch), so the influence normalizer cannot be yanked down within a single block by a large withdrawal, and a stale peak cannot persist indefinitely either. The permissionless `refreshSMax()` entry point settles a post and lets anyone advance this convergence; because registration happens only at settlement, a keeper calling it each epoch over the largest posts is what keeps `sMax` current for everyone — in production this is a required operational service, not a convenience.

For the full normative specification, see `claim-spec-evm-abi.md`, Appendix A.

---

## 4. Verity Score

### 4.1 Base Verity Score (internal)

The base Verity Score is the direct stake ratio on a post. It is an **internal quantity**: the protocol uses it only to gauge a link's credibility (Section 4.2.2, step 3). The score a post *has* — shown, ranked, propagated, and paid on — is the effective Verity Score of Section 4.2; for a post with no incoming evidence the two coincide.

Let `A` = total support stake, `D` = total challenge stake, `T = A + D`.

```
baseVS = (A − D) / T × RAY          (0 if T = 0)
```

Where `RAY = 10^18` (fixed-point scaling). The VS is clamped to `[−RAY, +RAY]`, corresponding to the range [−100%, +100%]. Base and effective VS are on the same scale: a post with 4 VSP support and 1 VSP challenge reads +60% whether it is scored directly or through the pool.

A post is considered **active** when its total stake meets or exceeds the activity threshold (governance-configurable, defaults to the posting fee). An inactive post has no Verity Score (it reads 0) and contributes nothing to any other post. Links are posts and are subject to the same rule.

### 4.2 Effective Verity Score

The effective Verity Score of a claim incorporates evidence from incoming links. **A contribution is stake.** One VSP of evidence arriving through a link acts on the child exactly as one VSP staked directly on that side would: it enters the child's pool, it cancels against the other side in the numerator, and it counts in the denominator. There is no cap on evidence and no discount for it; the only dilution is that a parent's mass is split across its outgoing links by stake share. Because the effective pool is also what settlement pays on (Section 3.2), evidence moves money, and every stake quantity that enters a contribution is **time-weighted over the settlement window** — a parent stake present for half the window contributes half its mass, exactly as a direct lot is prorated by presence. Evidence therefore cannot be flashed in for a settlement and withdrawn after; it is priced for as long as it stands, wherever it stands.

#### 4.2.1 Credibility Gate

Only credible claims can influence other claims. A parent claim with effective VS ≤ 0 contributes nothing through its outgoing links. Its links become inert until the community rehabilitates the parent with direct support stakes.

Similarly, a link with base VS ≤ 0 (i.e., the community has challenged the evidence relationship itself) contributes nothing.

This rule prevents three classes of abuse:

- **Credibility laundering**: an attacker creates a deliberately false claim, lets it accumulate challenges, then uses it as a challenge link against a target. Without the credibility gate, the double-negative (discredited parent × challenge link) would produce a positive contribution, hijacking other users' challenge stakes.
- **Poisoned support**: an attacker links a toxic claim as support for a legitimate claim. When the toxic claim is challenged, the support link would become an attack via sign inversion. The credibility gate silences discredited parents regardless of link type.
- **Oscillation and cascades**: in cyclic graphs, sign inversions from negative-VS parents could create feedback loops and unpredictable downstream effects. The credibility gate prevents these by ensuring only positive-VS claims propagate influence.

#### 4.2.2 Stake-Weighted Contribution Formula

For each incoming link to claim C from parent P via link L:

**Step 1: Compute parent mass.**

The parent's economic mass represents its stake-weighted credibility:

```
parentMass = parentEffectiveVS × parentTotalStake / RAY
```

Where `parentEffectiveVS` is in the range `(0, RAY]` (always positive due to the credibility gate) and `parentTotalStake` is the parent's direct total stake in token units (wei), **time-weighted over the window** (Section 4.2.5). The result is in token units and represents how much economic weight the parent carries.

**Step 2: Distribute across outgoing links.**

A parent's mass is distributed among its outgoing links in proportion to their stake, preventing duplication of influence:

```
linkShare = linkStake / sumOutgoingLinkStake
```

Where `sumOutgoingLinkStake` is the sum of total stake across all active outgoing links from P. Link stakes are time-weighted like all other stake quantities in this section.

**Step 3: Apply link credibility.**

The link's own Verity Score reflects the community's assessment of whether this evidence relationship is valid:

```
contribution = parentMass × linkShare × linkVS / RAY
```

Where `linkVS` is the base VS of the link post. If `linkVS ≤ 0`, the link is discredited and contributes nothing.

**Step 4: Apply link direction.**

Challenge links invert the contribution:

```
if isChallenge: contribution = -contribution
```

A positive contribution adds to the child's support side. A negative contribution adds to the child's challenge side.

**Bounded fan-in.** For gas safety, the ScoreEngine processes at most `maxIncomingEdges` incoming links per claim and sums at most `maxOutgoingLinks` outgoing links per parent during the share computation. Both limits default to 64 and are governance-configurable. When a claim or parent exceeds its limit, the relevant edges are sorted by link stake descending — with ties broken deterministically by link postId ascending (older link wins) — and only the top-N participate. Links whose parent claim is *inactive* (below the activity threshold) contribute nothing and are ranked as if their stake were zero, so they can never occupy a bounded slot or displace contributing evidence (R2-H). Writes are never refused by these bounds: LinkGraph accepts up to 1,000 incoming links per claim; the scoring bound decides which of them count, and stronger evidence that arrives later displaces weaker earlier links by out-staking them. Lower-staked edges beyond the cap are inert: they neither contribute to the parent's denominator nor produce a numerator. This preserves conservation of influence (§4.4) under bounded fan-out: a parent's mass is fully and exclusively distributed across its top-N outgoing links. Off-chain indexers that recompute scores should apply the same sort-and-cap rule with the same tiebreak to match on-chain behavior.

#### 4.2.3 Effective VS Computation

After accumulating all incoming link contributions:

```
totalSupport = directSupport + sum(positive contributions)
totalChallenge = directChallenge + abs(sum(negative contributions))
pool = totalSupport + totalChallenge

effectiveVS = (totalSupport - totalChallenge) / pool × RAY
```

The result is clamped to `[−RAY, +RAY]`. This is the post's Verity Score: the number displayed, the number that ranks it, the number that propagates through its outgoing links, and — as `(S, C)` — the number that determines which side accrues and how fast (Section 3.2). Evidence for and against a claim cancel in the numerator and remain in the pool, exactly like direct stakes on opposite sides: equal evidence on both sides makes a claim read as contested, not as certain.

#### 4.2.4 Examples

Claim A has 2 VSP support (VS = +100%). Claim B has 1 VSP support (VS = +100%). A challenges B via a link with 2 VSP support (link VS = +100%).

- parentMass(A) = 1.0 × 2.0 / 1.0 = 2.0 VSP
- sumOutgoing(A) = 2.0 (one outgoing link)
- linkShare = 2.0 / 2.0 = 1.0
- contribution = 2.0 × 1.0 × 1.0 = 2.0
- isChallenge → contribution = -2.0
- B: totalSupport = 1.0, totalChallenge = 0 + 2.0 = 2.0
- pool = 3.0
- effectiveVS(B) = (1.0 - 2.0) / 3.0 = **-33.3%**

The claim with 1 VSP support is pushed negative by the 2 VSP challenger, and from its next settlement B's supporters decay while direct challengers of B accrue. To defend B, participants can: add direct support to B, challenge claim A (reducing its VS and therefore its mass), or challenge the link itself (reducing its VS to silence it).

**Mixed evidence.** Claim C has 2 VSP direct support. One credible 1-VSP parent supports it through a 1-VSP link (+1.0) and another credible 1-VSP parent challenges it through a 1-VSP link (−1.0).

- totalSupport = 2.0 + 1.0 = 3.0; totalChallenge = 0 + 1.0 = 1.0; pool = 4.0
- effectiveVS(C) = (3.0 − 1.0) / 4.0 = **+50%**

The two contributions cancel in the numerator and both remain in the pool: C reads as a contested +50%, not as an unchallenged +100%, and it settles at half the truth pressure it would have without the challenge.

#### 4.2.5 Time-Weighted Stake

Every post keeps, per side, a running accumulator of `total × seconds` that is advanced on each stake change. A settlement window's time-weighted total is the accumulated area over the window divided by the window length. The score a post *displays* is the instantaneous pool — the same formula evaluated on current totals — while the score it *settles on* is the window average of that pool; the two agree whenever the graph has been still for the window. Parent totals, link stakes, and outgoing-link sums in Sections 4.2.2–4.2.3 are all taken time-weighted. This is the same proration rule that applies to a direct lot (Section 3.2) applied to evidence, so that a VSP is counted for exactly as long as it is committed, whether it sits on the post or on its evidence.

### 4.3 Cycle Handling

The link graph permits cycles structurally; the `LinkGraph` contract does not enforce acyclicity at write time. Acyclicity of the *score computation* is instead enforced at read time by the `ScoreEngine`:

1. When computing `effectiveVS(C)`, the engine maintains a stack of post IDs currently being computed (passed by reference through recursive calls).
2. Before recursing into a parent claim, the engine scans the stack. If the parent's post ID is already present, the recursion would close a cycle; the engine returns `0` for that parent's contribution rather than recursing.
3. A hard depth limit of 32 provides additional safety. Beyond this depth, contributions are truncated to zero regardless of cycle membership.

When a cycle is detected, only the cycled post's contribution is zeroed for that path. Other incoming edges of the same parent still compute normally. For example, if computing VS(F) encounters chain F→A→S→F, then F's contribution back to S along that path is 0, but A's other incoming edges (if any) are unaffected.

Combined with the credibility gate (Section 4.2.1), cycles are further stabilized: if a claim's effective VS drops to zero or below during computation, it ceases to influence its neighbors, preventing oscillatory feedback. The result is that the effective VS function is well-defined and bounded on any directed graph the protocol can produce, not merely on a DAG.

### 4.4 Conservation of Influence

A claim's economic mass is finite and is distributed — not duplicated — across its outgoing links. If a parent has mass M and three outgoing links with equal stake, each receives M/3. Adding more outgoing links from the same parent dilutes each link's share.

Under bounded fan-out (§4.2.2), this rule is enforced strictly: only the parent's top-`maxOutgoingLinks` outgoing links by stake participate in the distribution. Links beyond the cap are inert — they contribute zero to the target's effective VS and do not appear in the parent's denominator. Two consequences follow:

- The sum of `linkShare` across all of a parent's outgoing links is always ≤ 1.0, even when the parent has more outgoing links than the cap.
- Link spam past the cap is fully self-defeating: a low-stake "spam" link that fails to displace one of the top-N has zero influence. The attacker has burned their posting fee and locked stake for no effect.

This ensures:
- A single claim cannot amplify influence beyond its own stake-weighted credibility.
- The cost of meaningful influence scales with the stake required to maintain both the parent claim and the link, *and* to keep the link competitive against other outgoing links.
- Link spam is self-defeating: each additional link either dilutes the attacker's influence per target (within the cap) or contributes nothing (beyond the cap).

---

## 5. Token Economics

### 5.1 VSP Token

VSP is the native ERC-20 token of the protocol, deployed on Avalanche C-Chain. Mint and burn authority is held through an Authority contract and restricted to the protocol's StakeEngine; the token's supply cap is fixed at the genesis amount, so no discretionary party — including governance — can mint beyond it; only the StakeEngine's rate-bounded accrual (Section 3.2) mints, and it is exempt from the cap by construction so that earned gains are never withheld. VSP supports ERC-2612 permit, enabling gasless approvals.

### 5.2 Posting Fee

The posting fee is 1 VSP, burned upon post creation. The fee amount is governance-configurable.

The posting fee serves two purposes:
- Spam prevention: imposes a cost on publishing claims.
- Activity threshold: a post must accumulate total stake ≥ the activity threshold (which defaults to the posting fee) to become active and influence other posts.

### 5.3 Economic Properties

- **Deflationary pressure**: posting fees are burned, reducing supply.
- **Inflationary pressure**: correct stakes accrue value (minted by the StakeEngine).
- **Equilibrium**: the balance between creation (burning) and staking (minting) is governed by protocol parameters.

The mint and burn of VSP that back stake accrual and decay are performed under the
`Authority`'s minter/burner roles, which are held by the StakeEngine alone. Epoch
settlement runs on-chain, inside ordinary protocol transactions (stakes,
withdrawals, updates): the StakeEngine mints to accruing lots and burns from
decaying ones according to the rules in §3.2. No off-chain process holds any
minting authority; the only off-chain components are keepers that call the
permissionless `updatePost()` (an epoch settlement pass, parents before children) and
`refreshSMax()`. Anyone may call either. Role assignments are governed as described in
§6.2 and are revocable by governance.

### 5.4 Supply

The entire VSP supply — 1,000,000,000 VSP — was created in a single genesis mint at
deployment and is held by the operating company's treasury. The supply cap is flat
and equal to the genesis amount: the deployed code permits no further discretionary
minting by anyone, including the company and governance. Thereafter, total supply
changes only through the StakeEngine's staking mechanics — symmetric, rate-bounded
accrual and decay, which are exempt from the cap — and the burning of posting fees. No portion of the treasury was
locked at genesis; if the company places treasury supply under an on-chain vesting
contract, it will publish the contract address and release schedule.

---

## 6. Smart Contract Architecture

All contracts are deployed as UUPS upgradeable proxies behind a governance-controlled Authority.

| Contract | Purpose |
|----------|---------|
| VSPToken | ERC-20 token with ERC-2612 permit, Authority-controlled mint and burn |
| PostRegistry | Creates claims and links, burns posting fees, stores post metadata |
| LinkGraph | Stores directed evidence edges, enforces self-loop and duplicate prevention (cycles permitted) |
| StakeEngine | Manages per-post consolidated lots, computes positional rates, handles withdrawals |
| ScoreEngine | Computes base and effective Verity Scores with stake-weighted propagation, cycle-safe |
| ProtocolViews | Read-only aggregation of claim summaries, edge data, and scores |
| PostingFeePolicy | Governance-configurable posting fee |
| StakeRatePolicy | Governance-configurable staking rate bounds |
| ClaimActivityPolicy | Defines the minimum stake threshold for post activation |
| Authority | Role-based access control (minter, burner, governance roles) |

### 6.1 Meta-Transaction Support

All governed contracts (PostRegistry, StakeEngine, LinkGraph) inherit `ERC2771ContextUpgradeable`, which allows a trusted forwarder to submit transactions on behalf of users. The trusted forwarder address is set at deployment and can be updated via UUPS proxy upgrades.

VSPToken supports ERC-2612 permit, enabling signature-based approvals without a separate on-chain transaction.

These primitives allow third-party services to offer gasless interaction with the protocol. The protocol itself does not operate a relay or forwarder — it provides the on-chain hooks that make them possible. Users may always interact with the contracts directly using their own wallet and gas.

### 6.2 Governance

On the production (mainnet) deployment, governance authority over the protocol is
held by a `TimelockController` whose sole proposer and executor is a multi-signature
(2-of-3) operations Safe. The timelock enforces a minimum delay (no less than two
days on mainnet) between the scheduling and the execution of any privileged action,
and the timelock admin role is renounced at deployment, so there is no deployer
backdoor and no unilateral fast path.

Alongside governance, a separate **guardian** role (held by a dedicated
multi-signature Safe) can pause the protocol's entry points — new stakes and new
claims — in an emergency. The guardian cannot mint, cannot move funds, and cannot
unpause: withdrawals and position updates remain open during a pause so users can
always exit, and only governance, through the timelock, can lift a pause. Token
transfers are not pausable by anyone.

**Governance handoff is part of deployment, not an optional later step.** The
deployment procedure deploys the timelock, then transfers ownership of every
governed contract — including the `Authority` — from the deploying account to the
timelock via a two-step (propose/accept) transfer executed through the Safe. A
mainnet deployment is **not considered complete** until this handoff has occurred
and on-chain ownership of `Authority` resolves to the timelock. Until that point the
contracts remain deployer-owned and the deployment is provisional.

(Non-production test deployments may retain deployer ownership for iteration; that
is a property of a test environment, not of the protocol as deployed for real use.)

Through this timelocked, Safe-controlled governance, the following may be modified:
- Posting fee amount, staking rate bounds (min and max APR), and activity threshold (via the ProtocolPolicy contract; the policy contract itself can be replaced)
- Snapshot period, `sMax` decay rate and maximum decay epochs, and ScoreEngine fan-in/fan-out limits
- The Guardian address (pause-only role) and the resumption of a paused contract (`unpause`)
- Contract implementations (via UUPS proxy upgrades) and contract wiring (registry, link graph, policy addresses)
- Housekeeping operations: compaction of exhausted lots, re-scan of the `sMax` tracker, claim-hash backfill
- Authority roles

Nothing else is reachable by governance; in particular there is no path to mint, to move a user's stake, or to change the supply cap.

---

## 7. Design Properties

### 7.1 Permissionless

Any address may create claims, create links, and stake. No registration, reputation, or identity is required. Front-ends, bots, and automated agents interact with the same contracts as human users.

### 7.2 Composable

The protocol exposes all state through standard Solidity view functions. Third-party applications may build on top of the protocol: alternative front-ends, analytics dashboards, AI-powered truth-checking tools, and cross-chain bridges.

### 7.3 Non-Finalizing

Claims never "resolve." The Verity Score is a continuous, live signal that reflects the current state of economic commitment. New evidence, new stakes, and new challenges can shift any claim's score at any time. This makes the protocol suitable for persistent, evolving knowledge — not just terminal predictions.

### 7.4 Adversarial

The protocol is designed for adversarial participants. There is no assumption of good faith. Economic incentives align with truthful behavior: being right is profitable; being wrong is costly. The credibility gate (Section 4.2.1) ensures that discredited claims cannot be weaponized through the evidence graph. The protocol does not enforce truth — it creates conditions under which truth is economically favored.

Because evidence moves money (Section 3.2), the evidence graph is itself a battleground, and the protocol's answer is the same at every node:

- **Fabricated parents.** An attacker can create claims, stake them uncontested, and link them against a target; the mass reaching the target is stake-for-stake, so flipping a claim costs its direct stake in parent stake. The parents are ordinary claims: challenging a false parent is profitable, flips it, and silences its links through the credibility gate. Every evidence dispute is a claim dispute one level up.
- **Self-contention.** A parent linked to the same child with both polarities dilutes the child's score without taking a losing position. This is priced exactly as opposing direct stakes would be and is visible in the graph; the counters are to challenge the parent or either link.
- **Flash evidence.** Stake placed on a parent just before a child settles and withdrawn after would count for the whole window if evidence were read at an instant. It is not: all evidence quantities are time-weighted over the window (Section 4.2.5), so evidence is priced for as long as it stands, like any lot.
- **Ancestry bloat.** Settlement walks a post's ancestry, bounded by the fan-in limit ranked by link stake: to inflate a claim's ancestry an attacker must out-stake its real evidence at every level. Oversized settlements are routed to the keeper (`SettleFirst`), never skipped.

---

## 8. Deployment

The protocol is deployed on Avalanche C-Chain (chain ID 43113 for testnet, 43114 for mainnet). Avalanche provides sub-second finality, EVM compatibility, and low transaction costs suitable for interactive staking.

The protocol may optionally be deployed on a dedicated Avalanche Subnet for isolated throughput and custom gas economics.

---

## 9. Conclusion

Verisphere defines a minimal, permissionless protocol for attaching economic consequence to factual assertions. Claims compete in an open market of support and challenge. Evidence links create a directed graph where credibility propagates through stake-weighted connections. Only credible claims — those with positive community support — can influence others, preventing abuse through double-negative exploits or poisoned associations. The Verity Score provides a transparent, continuously updated signal of economic consensus.

The protocol does not determine truth. It makes truth economically consequential.
