# Fees

**Version:** 1.0 · **Effective Date:** October 12, 2026 · Verisphere Corp.

<!-- patch_fe_legal_docs -->

This page lists every charge you can meet while using Verisphere, who receives it, and how it is calculated. There are no hidden fees, no subscriptions and no percentage-of-value charges.

## At a glance

| What you do | Charge | Paid in | Goes to |
|---|---|---|---|
| Stake, unstake, create a claim, link evidence | **Relay fee** = our gas cost × 1.25 | VSP | Verisphere (covers the gas we pay) |
| Create a claim or a link | **Posting fee** 1 VSP | VSP | Burned by the protocol — nobody receives it |
| Buy or sell VSP | Pool fee 0.3 % per pool (0.6 % when paying with AVAX, which passes through two pools) + network gas | AVAX or USDC; AVAX for gas | Pool liquidity providers; Avalanche validators |
| Everything else (browsing, connecting, notifications) | Free | — | — |

## The relay fee

Actions inside Verisphere are **gasless for you**: your wallet signs a message, and our relay pays the Avalanche network fee ("gas") to submit it. The relay fee is how we recover that cost.

**How it is calculated.** Before you sign, the relay estimates the gas the action will use, multiplies by the current network gas price to get the cost in AVAX, converts to VSP at current market prices, and adds a **fixed 25 % markup**:

> fee (VSP) = gas × gas price × AVAX price ÷ VSP price × **1.25**

That is the whole formula. The fee depends only on gas — it is the same whether you stake 1 VSP or 1,000 — and there is no minimum fee. At today's typical Avalanche gas price (about 5 gwei) a stake costs a few hundredths of a US dollar's worth of VSP; a claim, which writes more data, somewhat more. The number shown is the quote; the markup is set in our relay's configuration and published at `/api/relay/fee-policy`.

**When you see it and when it is taken.** The progress box shows the quoted fee *before* you sign. Nothing is charged if you decline the signature, if the relay refuses the request, or if the transaction fails on chain. After the action confirms, the relay collects the fee from your wallet in a separate transfer, charging **the lower of the quoted fee and the fee recomputed at execution** — never more than you were shown. The transfer appears in your wallet history as a VSP transfer to the Verisphere treasury, and in **Transactions** in the app next to the action it belongs to.

**The permissions involved.** Smart contracts can only move your tokens with your prior permission (an ERC-20 "allowance"). Your first action therefore asks for up to two one-time signatures in addition to the action itself:

- an allowance letting the Verisphere **StakeEngine** take the VSP you stake — 10,000 VSP, renewed only when it runs low (this is *not* a charge; it is the permission that lets your own stakes go through, and it is only ever used by your own signed actions);
- an allowance of **100 VSP for relay fees**, renewed when it drops below 10 VSP — the fee is drawn from this, one small transfer at a time. The spender is the **FeeCollector** contract — on Avalanche C-Chain `0x7bdD96Bd5125e4B105c2B05BF3a149E9AFc8AAaD` (source verified on Snowtrace; also published as `feeCollector` by the app's `/api/relay/config`). Only Verisphere's relay can draw on it, and the contract enforces its own limits on chain whatever the cap says: at most **5 VSP per action** and **25 VSP per wallet per day**, fees going straight to the treasury; the Guardian can pause it and only the 48-hour Timelock can change its limits. Permissions signed before 2026-10-20 named the relay wallet `0x6b23ffeca4378be332e424bff653d534214b2b96` and are still honoured until your next action replaces them. <!-- patch_fe_docs_feecollector -->

MetaMask shows these two permissions as **Spending cap request** screens and the action itself as a **Signature request**; none of them is a gas transaction. After the first action you normally see a single signature request per action. <!-- patch_fe_docs_avax -->

## The posting fee

Creating a claim, or a link between claims, costs **1 VSP**, set by the protocol's governance and **burned** — removed from supply. Nobody, including Verisphere, receives it. It exists to keep the claim graph meaningful.

## Buying and selling VSP

The **Buy** and **Sell** windows trade against a public liquidity pool on a decentralized exchange from your own wallet. Verisphere charges nothing for this. You can pay with **AVAX** (the default: one transaction, no approval — your AVAX passes through the exchange's AVAX/USDC pool and then the VSP pool, so two 0.3 % pool fees apply) or with **USDC** (one pool fee, plus a one-time approval transaction). Selling works the same way in reverse, into AVAX or USDC. Pool fees go to the people who provide the pools' liquidity; the **Avalanche network fee** for each transaction is paid in AVAX from your wallet — typically well under 0.01 AVAX. Prices move with pool depth; the window shows the price impact of your order and the minimum you will receive before you confirm.

## What is never charged

Browsing claims, connecting a wallet, reading notifications, and viewing your positions are free. Failed or declined actions are free. There is no fee on winnings, no withdrawal fee and no account fee.

## Changes

The relay markup and the posting fee can change — the markup by our configuration, the posting fee by protocol governance. Any change will be reflected here with a new version number and effective date, and the live values are always readable from the app's `/api/relay/fee-policy` endpoint and the blockchain respectively.

Questions: info@verisphere.co
