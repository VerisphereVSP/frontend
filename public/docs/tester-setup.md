# Verisphere Tester Setup Guide

<!-- patch_fe_docs_ext_phone -->
> This page is the **test-network** (Avalanche Fuji) setup for testers. Everyday players: follow [How to Play](viewer.html?file=guide.md) instead — it covers the live network, phones and the [Chrome extension](https://chromewebstore.google.com/detail/hlpjnfmmhgccpnnildibenneggffkbok).

## 1. Install MetaMask

1. Go to [metamask.io](https://metamask.io) and click **Download**.
2. Install the browser extension (Chrome, Firefox, Brave, or Edge).
3. Follow the setup wizard to create a new wallet.
4. **Write down your seed phrase** and store it safely. Never share it.

## 2. Add Avalanche Fuji Testnet

1. Open MetaMask and click the network dropdown at the top (it says "Ethereum Mainnet").
2. Click **Add network** → **Add a network manually**.
3. Enter:

| Field | Value |
|-------|-------|
| Network Name | Avalanche Fuji |
| RPC URL | https://api.avax-test.network/ext/bc/C/rpc |
| Chain ID | 43113 |
| Currency Symbol | AVAX |
| Block Explorer | https://testnet.snowtrace.io |

4. Click **Save** and switch to Avalanche Fuji.

## 3. Get Test AVAX <!-- patch_fe_docs_avax -->

Test AVAX is what you buy test VSP with (and it pays the gas for that swap); everything inside Verisphere is gas-free.

1. Go to [faucet.avax.network](https://faucet.avax.network/) (it may ask for a coupon code or a mainnet balance — if it refuses, ask the project admin for test AVAX).
2. Paste your MetaMask wallet address and request test AVAX. 1–2 AVAX is plenty.

## 4. Connect to Verisphere

1. Go to **https://verisphere.co** (or the test URL provided).
2. Click **Connect Wallet** in the top-right corner.
3. MetaMask will pop up — approve the connection.
4. Your wallet address and balances will appear in the header bar.

## 5. Buy VSP Tokens

1. Click **Buy** in the header bar. **Pay with: AVAX** is selected.
2. Enter the amount of test AVAX to spend (start with 0.5 AVAX) and read the quote.
3. Click **Buy … VSP**. MetaMask opens once with an ordinary transaction — **Confirm**.
4. VSP appears in your header balance a couple of seconds later.

(Paying with test USDC also works — ask the project admin for some — and takes two confirmations: an approval, then the swap.)

## 6. What the wallet prompts look like

Staking and creating claims never spend AVAX. The first action asks for up to three prompts: two **Spending cap requests** (10,000 VSP to the StakeEngine contract; 100 VSP to the FeeCollector contract for fees) and the **Signature request** for the action itself. After that, one signature per action. Please count the prompts you get and report them.

## 7. Start Testing

- **Explore**: Type a topic in the search bar (e.g., "Climate Change", "Bitcoin") to see articles with stakeable claims.
- **Create a claim**: Click **+ Add claim**, type a factual assertion, set your stake, and create.
- **Stake**: Click any underlined claim to open it, then use the stake controls.
- **Portfolio**: Click **Portfolio** in the nav bar to see all your positions.
- **Claims Explorer**: Click **Claims** to see all on-chain claims with metrics.

## Troubleshooting

**MetaMask doesn't connect:** Make sure you're on the Avalanche Fuji network (check the network dropdown).

**"Claim creation failed":** Check your VSP balance — you need at least 2 VSP (1 for the posting fee + 1 for the initial stake).

**Transaction seems stuck:** Refresh the page and try again. Verisphere handles gas fees through meta-transactions, so you won't be double-charged.

**Can't see my stakes:** Check the Portfolio tab. If positions don't appear, click Refresh — the indexer may need a moment to sync.
