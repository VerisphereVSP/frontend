# How to Play Verisphere

## What is Verisphere?

Verisphere is a truth-staking protocol where you back factual claims with real VSP tokens. If you're right, you earn. If you're wrong, you lose. The community decides what's credible through economic consensus — not votes, not likes, not algorithms.

---

## Setting Up

### 1. Install MetaMask

MetaMask is a browser wallet that lets you interact with Verisphere. If you already have MetaMask installed, skip to step 2.

1. Go to [metamask.io](https://metamask.io) and click **Download**.
2. Install the extension for your browser (Chrome, Firefox, Brave, or Edge).
3. Follow the setup wizard to create a new wallet.
4. **Write down your seed phrase** and store it somewhere safe. This is the only way to recover your wallet. Never share it with anyone.

### 2. Add the Avalanche Network

Verisphere runs on Avalanche C-Chain. MetaMask needs to know about this network.

1. Open MetaMask and click the network dropdown at the top (it says "Ethereum Mainnet" by default).
2. Click **Add network** → **Add a network manually**.
3. Enter the following details:

| Field | Value |
|-------|-------|
| Network Name | Avalanche C-Chain |
| RPC URL | https://api.avax.network/ext/bc/C/rpc |
| Chain ID | 43114 |
| Currency Symbol | AVAX |
| Block Explorer | https://snowtrace.io |

4. Click **Save** and switch to the Avalanche C-Chain network.

Alternatively, visit [chainlist.org](https://chainlist.org/?search=avalanche), find "Avalanche C-Chain", and click **Add to MetaMask** for automatic setup.

### 3. Get USDC on Avalanche

You need USDC (a stablecoin pegged to the US dollar) on Avalanche to buy VSP tokens. There are several ways to get USDC on Avalanche:

**Option A: Buy directly on an exchange that supports Avalanche withdrawals**

1. Create an account on an exchange like Coinbase, Kraken, or Binance.
2. Purchase USDC.
3. Withdraw USDC to your MetaMask wallet address, selecting **Avalanche C-Chain** as the withdrawal network. This is important — if you select Ethereum or another network, your funds will not appear in Verisphere.
4. Your MetaMask wallet address is the string starting with `0x` shown at the top of MetaMask. Click it to copy.

**Option B: Bridge from Ethereum**

If you already have USDC on Ethereum:

1. Go to [core.app/bridge](https://core.app/bridge/) (Avalanche's official bridge).
2. Connect your MetaMask wallet.
3. Select USDC, choose "From Ethereum" → "To Avalanche", enter the amount, and confirm.

**Option C: Buy AVAX and swap**

1. Buy AVAX on any exchange and withdraw to your MetaMask wallet on Avalanche C-Chain.
2. Use a decentralized exchange like [Trader Joe](https://traderjoexyz.com) or [Pangolin](https://pangolin.exchange) to swap AVAX for USDC.

### 4. Connect to Verisphere

1. Go to [verisphere.co](https://verisphere.co).
2. Click **Connect Wallet** in the top right.
3. MetaMask will pop up asking you to connect — approve it.
4. You should see your wallet address and USDC balance in the header bar.

You don't need AVAX for gas — Verisphere submits transactions for you through a relay. The relay deducts a small fee in VSP from each transaction (currently up to 0.5% of transaction value, with a small minimum). Plain VSP transfers and reads are not subject to the relay fee.

### 5. Buy VSP Tokens

1. Click **Buy** in the wallet bar.
2. Enter the amount of USDC you want to spend.
3. Confirm the transaction in MetaMask.
4. VSP tokens appear in your balance immediately.

VSP is the only token you need to play. You can sell VSP back to USDC at any time by clicking **Sell**.

---

## Playing the Game

### Explore a Topic

Type any topic in the search bar — "climate change", "bitcoin", "quantum computing" — and Verisphere generates an article with factual claims. Each claim can be staked, challenged, and linked to evidence.

### Claims

A **claim** is a factual assertion, like "Earth is a spheroid" or "The greenhouse effect is caused by atmospheric gases." Claims live on-chain permanently. Creating a claim costs **1 VSP** (burned as a fee) plus an initial stake.

### Staking

Every claim has two sides: **support** and **challenge**. You can only hold a position on **one side** of any given claim at a time — but you can switch sides in a single transaction by setting a signed target. The protocol handles the withdrawal of your old position and the opening of your new position atomically.

- **Positive stake** (+1, +5, etc.) = stake in **support** (you believe the claim is true)
- **Negative stake** (-1, -5, etc.) = stake in **challenge** (you believe the claim is false)
- **Zero** = withdraw your entire position on this claim, regardless of which side it was on

Switching sides costs only the relay fee on the single transaction; you do not pay a separate posting fee, and you do not need to wait between the withdrawal and the new stake. Note that switching sides closes your old lot entirely — you start fresh at the back of the new side's queue, with no preserved positional advantage.

Your stake earns or loses value over time based on the claim's **Verity Score (VS)**.

### Verity Score (VS)

The VS reflects economic consensus:

- **VS > 0%** → More support than challenge. Supporters earn, challengers lose.
- **VS < 0%** → More challenge than support. Challengers earn, supporters lose.
- **VS = 0%** → Contested or inactive. Nobody earns or loses.

The VS is shown as a colored number next to each claim: green for positive, red for negative.

### Evidence Links

Claims don't exist in isolation. You can link one claim to another as **support** or **challenge**:

- "Earth is a spheroid" **challenges** "Earth is flat" → If the challenger is credible (VS > 0), it pushes the target's VS down.
- "CO2 absorbs infrared" **supports** "Greenhouse effect is real" → Credible support pushes the target's VS up.

Links are also stakeable. Staking on a link means "I believe this evidence relationship is valid."

**Key rule: Only credible claims influence others.** If a claim's VS drops to zero or below, all its outgoing links go silent — it can't affect other claims until it regains positive VS through direct support.

---

## How to Win

### Strategy 1: Back the Truth Early

Find claims that are true but undervalued. Stake support early — you get the best queue position, which means the highest earning rate. As more people agree and stake support, the VS rises, and your position earns faster.

### Strategy 2: Challenge Misinformation

Find claims that are false but have support. Stake challenge. If you're right and the community follows, the VS goes negative, and challengers earn while supporters lose their stake.

### Strategy 3: Build Evidence

Instead of staking directly on a crowded claim, create or stake on **evidence links**. A well-staked challenge link from a credible source can flip a claim's VS — and your link stake earns from a smaller, less competitive pool.

### Strategy 4: Defend Your Positions

If someone challenges a claim you support, you can:
- Add more direct support stake
- Challenge the challenger's claim (reduce its VS, reducing its influence)
- Challenge the evidence link itself (silence it)

---

## Earning Rate (APR)

Your earning rate depends on four factors:

1. **Truth Pressure** — How strong the VS is. A VS of 100% means maximum earning pressure. VS of 0% means no earnings. The VS that pays is the claim's *effective* score — direct stake **and** the evidence linked to it — averaged over the epoch: a VSP of evidence counts exactly like a VSP staked directly, for as long as it stands. Settlement happens once per epoch (daily), and evidence is read from the **last settlement** of the source claim and the link: new or changed evidence is counted from the next daily settlement, one hop per day, once it has stood for at least **1 VSP-day** (see Settlement below).
2. **Post Size** — Larger total stakes face stronger pressure. Your claim's total stake relative to the system-wide reference (`sMax`).
3. **Queue Position** — Earlier stakers earn more. Your position weight is based on where you entered the queue: `positionWeight = 1 − (yourPosition / sideTotal)`, where `yourPosition` is the midpoint of your share of the side total. A sole staker on a side earns at half the base rate; the first of many earlier stakers approaches the full rate; later entries earn progressively less. An individual lot's effective rate never exceeds the base rate.
4. **Rate Bounds** — Earning rates scale from 0% (at VS = 0) up to a maximum of 100% APR.

Winners (your side aligns with the VS direction) earn at this rate. Losers (opposing side) lose at this rate.

---

## Key Concepts

### Posting Fee
Creating a claim or link costs **1 VSP**, which is permanently burned. This prevents spam and gives every new claim an initial positive VS.

### Activity Threshold
A claim or link needs at least 1 VSP of stake, averaged over the day, to be "active" for that day's settlement and influence other claims (see the presence bar under Settlement).

### Credibility Gate
Only claims with VS > 0 can influence other claims through evidence links. A discredited claim (VS ≤ 0) is inert in the evidence graph until rehabilitated.

### Settlement
Once a day every claim and link **settles**: its positions gain or lose for the day, and it records a snapshot of its stake and score. A claim's evidence is read from those snapshots, so what you see next to an evidence link — its **Effect** — is the contribution as of the last settlement of that link and its source claim. A change deeper in the graph arrives one hop per day.

**The presence bar.** A link or claim counts in a day only if its stake, averaged over that day, is at least the activity threshold of 1 VSP — in other words, at least **1 VSP-day of presence**: 1 VSP standing the whole day, 2 VSP for half a day, 4 VSP for six hours. So a 1-VSP link placed at noon counts from the settlement *after* next (its first full day), while a 2-VSP link placed at noon counts at the very next one. This is what stops anyone from staking a link for the last minutes of a day and having it count for the whole day. Settlement is permissionless and the network runs it for every post shortly after each daily boundary; if a transaction answers "being settled by the network — please retry in a moment", the network is doing exactly that, and the retry goes through.

### Conservation of Influence
A claim's influence is distributed — not duplicated — across its outgoing links, in proportion to the stake on each link. Creating more links from the same claim dilutes each link's share. On the receiving side, a claim counts its 64 most-staked eligible incoming links; links beyond those have no effect, so flooding a claim with weak links does nothing.

### Single-Sided Positions
You can only hold a position on one side of any given claim at a time. To flip from support to challenge (or vice versa), set a signed target on the opposite side — the protocol withdraws the old position and opens the new one in a single transaction. Flipping closes your old lot entirely; the new position starts at the back of the destination side's queue.

---

## Quick Reference

| Action | Cost | What it does |
|--------|------|-------------|
| Create claim | 1 VSP fee + initial stake | Publishes a factual assertion on-chain |
| Create link | 1 VSP fee + initial stake | Connects two claims as support or challenge |
| Stake support | Any amount | Backs a claim as true (earns if VS > 0) |
| Stake challenge | Any amount | Backs a claim as false (earns if VS < 0) |
| Withdraw | Free | Removes your stake at any time |
| Buy VSP | USDC | Purchase tokens to play |
| Sell VSP | Free | Convert tokens back to USDC |

---

## Tips

- **Start small.** Stake 1 VSP to learn how the system works before committing more.
- **Check the evidence graph.** A claim might look safe but have a strong incoming challenge link that's about to flip its VS — evidence shows its Effect from the first settlement after it has stood for 1 VSP-day.
- **Queue position matters.** Being first to stake on a new claim gives you the best earning rate.
- **Links are cheaper plays.** Staking on a link lets you influence a claim's VS without competing in a large direct stake pool.
- **Watch the Portfolio.** Your Portfolio page shows real-time APR, position status, and the factors behind your earnings.
- **VS = 0 is not safe.** A claim with VS = 0 isn't earning anything, and one well-funded challenge can push it negative quickly.
- **One side only.** You can't hedge by staking both sides of the same claim. Pick a side and commit.

---

## Troubleshooting

### MetaMask doesn't show Avalanche
Make sure you've added the Avalanche C-Chain network manually (see step 2 above) or used chainlist.org.

### My USDC isn't showing up
Confirm that you withdrew USDC on the **Avalanche C-Chain** network, not Ethereum or another chain. Also check that you're looking at the correct MetaMask account and network.

### Transaction is stuck or pending
Verisphere handles gas fees for you through meta-transactions. If a transaction seems stuck, try refreshing the page and resubmitting. Your wallet won't be double-charged.

### I can't find my position
Check the **Portfolio** tab. All your active stakes appear there with their current VS, APR, and status.

### "This post is being settled by the network — please retry in a moment"
Your transaction arrived while the post, or evidence it depends on, still had a daily settlement outstanding. The network settles it within moments; resubmit and it goes through. Nothing was charged.

### "Cannot stake on opposite side"
You already have a stake on the other side of this claim. Withdraw it first (set your target to 0), then stake on the new side.
