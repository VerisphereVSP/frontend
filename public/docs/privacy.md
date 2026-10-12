# Privacy Policy

**Verisphere Corp.**, a Delaware corporation ("Company," "we," "us")
**Version:** 1.0
**Effective Date:** October 12, 2026
**Contact:** info@verisphere.co

<!-- patch_fe_legal_docs -->

This policy describes what information the Verisphere web application and browser extension (the "Service") handle, and what we do with it. The short version: **there are no accounts, no passwords, no e-mail sign-up, no advertising, and no analytics trackers.** You use the Service with a crypto wallet, and nearly everything the Service touches is public blockchain data.

## 1. What the Service is

Verisphere is an interface to a set of open-source smart contracts on the Avalanche blockchain (the "Protocol"). Claims, links, stakes and scores live on the blockchain, where they are public and permanent. The Service reads that public data, shows it to you, and — when you ask — submits your signed instructions to the blockchain through our relay. We never hold your tokens or your keys.

## 2. Information we handle

**Your wallet address.** When you connect a wallet, the Service learns its public address. The address is public information by nature: everything you do on the Protocol is recorded on the blockchain under it, and anyone can look it up there. We use the address to show you your positions, to quote and collect the relay fee, to deliver in-app notifications about your actions, and to apply per-address rate limits on the relay.

**Your signed actions.** To stake, create a claim or link evidence through the relay, your wallet signs a message describing the action. We receive that signature and the action, submit it to the blockchain, and keep a log of the submission (your address, the action, the transaction hash, the quoted and charged fee, and its outcome) so that we can show you progress, resolve problems, and account for fees. This log mirrors what becomes public on the blockchain.

**Claim text.** The text of a claim you create is stored permanently on the blockchain and is public. Before the relay submits it, the text is checked against our content policy by an automated system that includes a third-party large-language-model provider (currently Anthropic); the text is sent to that provider for the check and is not used by us for anything else. Content you post is public by design — do not include personal information about yourself or others.

**Network and device data.** Like every web service, our servers receive your IP address, browser type and the pages you request, and keep standard server logs for operations and security. We also use your IP address (in memory, briefly) to rate-limit requests and the relay. We do not use cookies and we do not run analytics or advertising trackers. The Service stores a few preferences in your browser's local storage (for example, which notifications you have already read); these never leave your browser.

**E-mail.** If you write to us, we keep the correspondence to answer you.

## 3. What we do not do

- We do not sell, rent or trade information about you.
- We do not build advertising profiles or use third-party analytics.
- We do not link your wallet address to your name or identity, and we do not ask you to.
- We do not hold your tokens or your private keys, and we never ask for them.

## 4. Third parties you interact with

Using the Service necessarily involves other parties, each with its own privacy terms:

- **Your wallet** (MetaMask or another) and, on mobile, the **WalletConnect** relay that connects your wallet to the Service.
- **The Avalanche network and its public RPC nodes**, which the Service and your wallet contact to read and submit transactions. Transaction data is public and permanent.
- **Block explorers and decentralized exchanges** you may open from links in the Service.
- **Our moderation provider** (Section 2), which receives claim text only.
- **Our hosting provider**, which processes traffic to our servers.

## 5. Retention

Blockchain data is permanent and outside our control. Our relay and fee logs are kept for as long as we need them to operate the Service and meet our accounting and legal obligations. Server logs are kept for a limited period for security and troubleshooting and then discarded. Moderation checks are not retained beyond the request.

## 6. Your choices and rights

You can disconnect your wallet at any time; the Service then knows nothing about you beyond what is on the public blockchain. You can use the Protocol without the Service at all, directly from your wallet, paying your own gas. Depending on where you live you may have rights to access, correct or erase information we hold about you; write to info@verisphere.co and we will respond. Note that we cannot alter or remove anything recorded on the blockchain — nobody can.

## 7. Children

The Service is not directed at anyone under 18 and we do not knowingly handle information from minors.

## 8. Changes

We will post any change to this policy here with a new version number and effective date. Material changes will be announced in the Service.

## 9. Contact

info@verisphere.co — Verisphere Corp., a Delaware corporation.
