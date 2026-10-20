# How to Play Verisphere

<!-- patch_guide_v2 --><!-- patch_fe_gas_fee --><!-- patch_fe_docs_avax -->

Verisphere is a truth-staking protocol: you back factual claims with VSP tokens. If the claim holds up, you earn; if it doesn't, you lose. What counts as credible is decided by what people are willing to stake, not by votes or likes.

This guide takes you from nothing to your first stake. If you have never used a crypto wallet, budget about **45 minutes** the first time — most of it waiting for an exchange. After that, every action takes seconds.

**What you will need**

- A desktop browser (Chrome, Firefox, Brave or Edge) with the MetaMask extension.
- Some **AVAX**, the Avalanche network's own coin. It does two jobs: it is what you **buy VSP with** (the default), and it pays the network fee ("gas") for the buy and sell transactions — a fraction of a cent each. **0.1 AVAX** is enough to buy a starter amount of VSP and leave gas to spare. Everything you do *inside* Verisphere — staking, creating claims, linking evidence — is gas-free.
- Optional: **USDC**, a dollar-pegged stablecoin. You can pay for VSP with USDC instead of AVAX if you already hold some on Avalanche; you still need a little AVAX for gas.

---

## Part 1 — Set up your wallet

### Step 1. Install MetaMask

1. Go to [metamask.io/download](https://metamask.io/download/) and install the extension for your browser. Only install from that address.
2. Open it and choose **Create a new wallet**.
3. Write your **Secret Recovery Phrase** (12 words) on paper and keep it somewhere safe. It is the only way to recover the wallet; anyone who has it has your funds. Never type it into a website and never share it.
4. Set a password. You are now looking at an empty wallet on "Ethereum Mainnet".

Your wallet **address** is the `0x…` string at the top of MetaMask. Click it to copy. You will paste it into an exchange in Step 3.

### Step 2. Add the Avalanche network

Verisphere runs on **Avalanche C-Chain**. MetaMask has to be told about it once.

Easiest: open [chainlist.org/chain/43114](https://chainlist.org/chain/43114), click **Connect Wallet**, then **Add to MetaMask**, and approve the two prompts ("Allow this site to add a network", "Switch network").

Manual alternative: MetaMask → network menu (top left) → **Add network** → **Add a network manually**:

| Field | Value |
|-------|-------|
| Network name | Avalanche C-Chain |
| RPC URL | https://api.avax.network/ext/bc/C/rpc |
| Chain ID | 43114 |
| Currency symbol | AVAX |
| Block explorer | https://snowtrace.io |

Check: the network menu now reads **Avalanche C-Chain**. Stay on it for everything that follows.

### Step 3. Get AVAX into your wallet

One asset is enough: **AVAX** buys the VSP and pays the gas. The simplest route is an exchange account that withdraws to Avalanche.

1. Create an account on an exchange that supports Avalanche C-Chain withdrawals — for example [Coinbase](https://www.coinbase.com), [Kraken](https://www.kraken.com) or [Binance](https://www.binance.com). Identity verification can take minutes to a few days.
2. Buy the **AVAX** you want to play with — 0.1 AVAX covers a starter amount of VSP plus gas for many swaps; buy more if you plan to stake more.
3. **Withdraw AVAX** to your MetaMask address. In the withdrawal form choose network **Avalanche C-Chain** (sometimes shown as "Avalanche", "AVAX C-Chain" or "AVAXC"). This is the step people get wrong: if you pick any other network, the coins will not be in your Avalanche wallet. Confirm by e-mail or authenticator if the exchange asks.
4. Wait. Withdrawals usually arrive in 2–15 minutes. New exchange accounts sometimes hold withdrawals for a few days after a bank deposit; the exchange shows a date if so.
5. AVAX shows in MetaMask automatically once you are on the Avalanche C-Chain network.

Faster alternative: MetaMask's own **Buy** button sells AVAX by card or bank transfer in many countries — choose **Avalanche** as the network and it lands directly in your wallet.

If you would rather pay with **USDC**, withdraw native USDC the same way (network Avalanche C-Chain, not Ethereum or Solana) and import it in MetaMask under **Tokens → Import tokens → Custom token** with the contract `0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E` (symbol and 6 decimals fill in; Avalanche also has an older bridged "USDC.e" — Verisphere uses the native one). You still need a little AVAX for gas. [Circle's bridge](https://bridge.circle.com) moves USDC between Ethereum, Base and Avalanche; the [Core bridge](https://core.app/bridge/) moves other assets to Avalanche.

### Step 4. Open the app and connect

1. Go to [app.verisphere.co](https://app.verisphere.co).
2. Click **Connect Wallet** (top right) and choose MetaMask. MetaMask opens: pick your account → **Next** → **Connect**. If it asks to switch to Avalanche C-Chain, approve that too.
3. The header now shows your address, your VSP balance (0.00 for now) and the **Buy** and **Sell** buttons.

Connecting is a permission, not a transaction: nothing moves and nothing is charged.

### Step 5. Buy VSP

VSP trades on a public liquidity pool on Avalanche. Verisphere does not sell it; the **Buy** button executes a swap on that pool from your own wallet — the site never holds your funds.

1. Click **Buy** in the header. The **Buy VSP** window opens with **Pay with: AVAX** selected (switch to **USDC** if you brought USDC instead). It shows your balance in the asset you pay with; if you have no AVAX at all, finish Step 3 first.
2. **Paying with AVAX** (the usual way): type the amount of AVAX to spend — **Max** leaves a little for gas. The window quotes how much VSP you receive, the minimum you will accept (a 0.5 % price move is tolerated while you confirm) and the price impact if it is noticeable. Click **Buy … VSP**. MetaMask opens **once**, with an ordinary transaction screen (it says **Confirm**, shows the AVAX amount and a small network fee). Confirm it; two seconds later the window shows **Done ✓**. No approval step: AVAX is the network's own coin, so nothing has to be permitted first.
3. **Paying with USDC:** type an amount. The ⇄ button switches between entering VSP and entering USDC; **Max** fills in your whole USDC balance. Click **Preview Fill** to see how much VSP you receive, the pool's 0.3 % fee, and the minimum you will accept (1 % tolerance). Then click **Buy … VSP**. MetaMask opens **twice**:
   - *"Approve in your wallet…"* — a **Spending cap request** letting the pool's router take exactly this much USDC. Click **Confirm**. This is a real transaction: it uses a tiny amount of AVAX and confirms in about two seconds while the window says *"Waiting for approval…"*.
   - *"Confirm the swap in your wallet…"* — the swap itself. Click **Confirm**. Another small AVAX fee, another two seconds (*"Swapping…"*).
4. The window shows **Done ✓** and your VSP balance in the header updates. To see VSP inside MetaMask as well, click **+ add VSP to wallet** next to the balance (one MetaMask prompt, **Add token**) — or import it manually as a custom token: `0x0273B4D58E8991f71fC28d0377424d03d7c3b173`, symbol VSP, 18 decimals. <!-- patch_fe_add_vsp_wallet -->

Where the VSP comes from: a public liquidity pool on the Trader Joe exchange (VSP/USDC). Paying with AVAX routes through Trader Joe's AVAX/USDC pool first, all inside one transaction, so two 0.3 % pool fees apply instead of one; paying with USDC is one pool fee plus the approval transaction. Gas on Avalanche is small — well under 0.01 AVAX per transaction — so 0.1 AVAX covers many swaps.

---

## Part 2 — Your first actions

### What a Verisphere action looks like

Inside Verisphere you never pay gas. Nothing you sign here spends AVAX: a relay submits the transaction for you and takes a small fee **in VSP** — its own cost of gas plus a fixed markup, the same for a large stake as for a small one. The progress box shows the fee before you sign, and it is taken only after the action has confirmed. Your first action can ask for up to three wallet prompts in a row; after that, usually just one:

1. **Permission for the protocol to use your VSP** — MetaMask shows this as a **Spending cap request**: spender = the Verisphere StakeEngine contract, cap = **10,000 VSP** (or twice your stake, if larger). It is a one-time permission, not a charge: only your own signed stakes can draw on it, and it is renewed only when it runs low.
2. **Permission to take relay fees** — another **Spending cap request**: spender = the Verisphere **FeeCollector** contract (`0x7bdD96Bd5125e4B105c2B05BF3a149E9AFc8AAaD` on Avalanche C-Chain, source verified on Snowtrace), cap = **100 VSP**, renewed when it drops below 10. Fees are drawn from this one small transfer at a time. The contract itself limits what can be taken — at most 5 VSP per action and 25 VSP per wallet per day, with a guardian pause — whatever the cap says. <!-- patch_fe_docs_feecollector -->
3. **The action itself** — a **Signature request** naming the action (stake, claim, link). This is the only prompt you will normally see.

Read each one — it names the token, the amount and who may spend it — and click **Confirm** (older MetaMask versions say **Sign**). None of these is a gas transaction: the AVAX line stays at zero. While a request is open, a dark bar at the top of the page says so and names the step ("1 of 2: Allow relay fees…"); if the MetaMask window is not in front, click the MetaMask icon in your browser toolbar. A progress box then tracks the action ("Confirming … on chain"); it confirms in a few seconds and the page updates within about half a minute once the indexer has caught up. If you close MetaMask instead of signing, nothing happens and nothing is charged.

Creating a claim or a link *with an opening stake* is two actions in a row — first the post, then the stake — so expect two rounds of signature requests.

### Find your way around

The header has four pages:

- **Explore** — type a topic in the box ("State a claim or search a topic…"), for example "climate change" or "quantum computing". Verisphere writes an article made of factual claims, each one stakeable right there.
- **Claims** — every claim and link on-chain, searchable, with its score, stake and evidence links. This is where you create links.
- **Positions** — everything you have staked, with the score, rate and status of each position (connect your wallet to see it).
- **Transactions** — the history of your actions, each with a link to the transaction on [snowtrace.io](https://snowtrace.io).

### Stake on a claim

1. Open a claim — in an article on **Explore** or from the **Claims** page.
2. In the box **Your stake on this claim**, enter the amount of VSP you want to hold: **positive** to support (you think it's true), **negative** to challenge (you think it's false). `1` is a sensible first stake.
3. Apply it, sign the requests, and wait for the progress box to finish.

The number you enter is your *target* position, not an addition: entering `3` when you already hold `1` adds 2 VSP; entering `0` withdraws everything. You can hold a position on only **one side** of a claim. To switch sides, enter an amount with the other sign: the protocol closes the old position and opens the new one in a single action, and your new position starts at the back of that side's queue.

### Create a claim

A claim is one factual assertion, up to **1,000 characters**, stored on the blockchain permanently and visible to everyone under your address. It cannot be edited or deleted, and an identical claim (ignoring case and spacing) is rejected as a duplicate. Creating one costs a **1 VSP posting fee**, which is burned, plus whatever you stake on it.

1. On **Explore**, open an article and click the **+** button.
2. Write the claim ("Write a factual claim to add on-chain…"). Verisphere may suggest a tighter wording; keep yours or take the suggestion.
3. Enter the **Initial stake** (in VSP, support) and click **Create & stake**. Sign the requests.

Write a claim that could be wrong and that someone could check — "The Eiffel Tower is 330 metres tall", not "The Eiffel Tower is beautiful".

### Link claims as evidence

Evidence in Verisphere is a **link** from one claim to another, marked **Support** or **Challenge**: "CO₂ absorbs infrared" supports "The greenhouse effect is real". A link is a post of its own: it costs the same 1 VSP fee, carries its own stake, and has its own score. Staking on a link says "this evidence relationship is valid".

1. On the **Claims** page open the claim the evidence is *about* and click **Incoming Links** (evidence for or against this claim). Or open the claim that *is* the evidence and click **Outgoing Links** (this claim as evidence for or against another).
2. In the search box find the other claim, or **browse all claims** to pick it.
3. Toggle **✦ Support** / **⚔ Challenge**, set the stake (1 VSP is the default), and create the link. Sign the requests — once for the link, once more for its stake.

A link only affects its target while the source claim is credible (score above zero) and the link has enough stake standing (see the presence bar below).

### Sell VSP and cash out

1. Click **Sell** in the header. The **Sell VSP** window mirrors buying: choose **Receive: AVAX** (default) or **USDC**, enter the VSP to sell (**Max** for all of it), read the quote, click **Sell … VSP**.
   - **For AVAX:** the first time, MetaMask opens twice — a **Spending cap request** letting the pool's router take VSP (a standing 10,000 VSP, so later sells skip this step; **Confirm**), then the swap itself (**Confirm**). After that, one prompt per sell. The AVAX lands in your wallet.
   - **For USDC:** **Preview Fill** → **Sell … VSP** → **Confirm** twice (approve exactly this much VSP, then the swap).
2. To move AVAX or USDC back to an exchange, use MetaMask **Send**: paste the exchange's deposit address *for Avalanche C-Chain* for that asset and send. Sending to an Ethereum deposit address loses the funds.

Keep a little AVAX in the wallet for gas; if MetaMask says "insufficient funds for gas", that is the AVAX balance, not your USDC or VSP.

---

## Part 3 — How the game works

### Verity Score (VS)

Each claim shows a score between −100 % and +100 %:

- **VS > 0** — more support than challenge. Supporters earn, challengers lose.
- **VS < 0** — more challenge than support. Challengers earn, supporters lose.
- **VS = 0** — contested or inactive. Nobody earns or loses.

The score that pays is the *effective* score: the claim's own stake **plus** its linked evidence, counted as of the last settlement.

### Settlement — once a day

Every claim and link settles once a day, shortly after **00:00 UTC**: positions gain or lose for the day, and the post records a snapshot of its stake and score. Evidence is read from those snapshots, so a new link affects its target from the next settlement, one hop per day.

**The presence bar.** A post counts in a day only if its stake averaged over that day is at least **1 VSP** — one VSP standing the whole day, two for half a day, four for six hours. A 1 VSP link placed at noon UTC counts from the settlement *after* next; a 2 VSP link placed at noon counts at the very next one. The bar under each post shows how far it is from counting.

If an action answers *"This post is being settled by the network — please retry in a moment"*, the daily settlement is running on that post; retry a few seconds later. Nothing was charged.

### What you earn

Your rate depends on four things: how strong the score is (0 % at VS = 0, more as |VS| grows), how large the post's total stake is relative to the system reference, your place in the queue (earlier stakers on a side earn more), and the protocol's rate bounds (never above 100 % per year). If your side matches the score's sign you earn at that rate; the other side loses at it. **Positions** shows the live rate and the factors behind it for every stake you hold.

### Rules worth knowing

- **Credibility gate.** A claim with VS ≤ 0 cannot influence other claims through its links until it recovers.
- **Conservation of influence.** A claim's influence is shared across its outgoing links in proportion to their stake, not duplicated. A claim counts at most its 64 best-staked incoming links.
- **Permanence.** Claims and links are on-chain forever, under the address that made them.

---

## Strategy

- **Back the truth early.** The first stakers on a true claim get the best queue position and the best rate.
- **Challenge what's wrong.** A false claim with support is an opportunity: stake challenge, and if others follow, the score turns negative.
- **Build evidence.** A credible challenging link can flip a crowded claim's score, and a link's stake pool is smaller and less competitive.
- **Defend.** If a claim you support is challenged, add support, challenge the challenger's claim, or challenge the link itself.
- **Start small** — 1 VSP — until the daily settlement and the presence bar make sense to you.

---

## Quick reference

| Action | Where | What it costs | What you click in MetaMask |
|--------|-------|---------------|----------------------------|
| Get AVAX | Exchange → withdraw on Avalanche C-Chain (or MetaMask **Buy**) | Exchange fees | — (confirm on the exchange) |
| Buy VSP with AVAX | **Buy** → amount → Buy | Pool fees 0.6 % (two pools) + tiny AVAX gas | **Confirm** ×1 (the swap) |
| Buy VSP with USDC | **Buy** → USDC → Preview Fill → Buy | Pool fee 0.3 % + tiny AVAX gas | **Confirm** ×2 (approve, swap) |
| Stake / change / withdraw | The claim's stake box | Relay fee in VSP (shown first), no gas | Signature ×1 (×3 the first time: two spending caps + the action) |
| Create claim | Explore → article → **+** | 1 VSP burned + stake + relay fee, no gas | Signature ×1 per step (claim, then stake) |
| Create link | Claims → Incoming / Outgoing Links | 1 VSP burned + stake + relay fee, no gas | Signature ×1 per step (link, then stake) |
| Sell VSP for AVAX | **Sell** → amount → Sell | Pool fees 0.6 % + tiny AVAX gas | **Confirm** ×2 the first time (standing approval, swap), then ×1 |
| Sell VSP for USDC | **Sell** → USDC → Preview Fill → Sell | Pool fee 0.3 % + tiny AVAX gas | **Confirm** ×2 (approve, swap) |

---

## Troubleshooting

**MetaMask doesn't show Avalanche.** Repeat Step 2; check the network menu reads Avalanche C-Chain.

**My AVAX or USDC isn't showing.** Check the withdrawal used network Avalanche C-Chain; check you are looking at the same account you pasted into the exchange; for USDC, import it as a custom token (Step 3). A withdrawal can take 15 minutes — look it up on [snowtrace.io](https://snowtrace.io) by pasting your address.

**"This wallet has no AVAX" / "insufficient funds for gas".** Only buying and selling need AVAX, and the buy itself is paid in AVAX. Send 0.1 AVAX to your wallet from the exchange (Step 3).

**The Buy or Sell button is missing.** Connect your wallet first; the buttons appear once you are connected and the pool is reachable.

**The swap failed or MetaMask says the transaction would revert.** The pool moved more than the tolerance (0.5 % paying with AVAX, 1 % with USDC) while you were confirming. Re-enter the amount (or **Preview Fill** again) and retry. Your AVAX or USDC is still in the wallet; a failed transaction costs at most its small gas.

**MetaMask shows "Spending cap request" or "Signature request" — is that safe?** Inside Verisphere, yes: that is how gas-free actions work. The two spending caps are the one-time permissions described above (10,000 VSP to the StakeEngine contract, 100 VSP to the FeeCollector contract); the signature request is the action itself. Read the token, the amount and the spender. Verisphere never asks you to sign a blank message, never asks for an unlimited amount, and never asks you to send funds anywhere.

**MetaMask flags a spending cap as risky.** Wallet security tools flag spending caps whose spender is a plain wallet address or an unknown contract. Verisphere's spenders are verified contracts: the StakeEngine (`0x19862B3790e455d88920630Bbc4012A0F195D7C9`) and the FeeCollector (`0x7bdD96Bd5125e4B105c2B05BF3a149E9AFc8AAaD`) — compare the address before confirming. If you signed a fee permission before 2026-10-20 it may name the relay's wallet address instead; that older permission is still honoured for a while, and your next action asks for the contract one.

**"Insufficient VSP for relay fee: need …".** The message names the exact amount; you need that much on top of what you stake. Buy a little more.

**Action stuck in the progress box.** Refresh the page and check **Transactions**: the action either confirmed (it is listed) or never went out (sign again). You cannot be charged twice for the same action.

**"Cannot stake on opposite side."** You hold a stake on the other side. Enter an amount with the sign you want (the protocol switches you) or 0 to withdraw.

**I can't find my position.** **Positions** lists every stake with its score, rate and status.

**I lost my Secret Recovery Phrase.** Nobody — not Verisphere, not MetaMask — can restore it. Move your funds to a new wallet whose phrase you have written down.
