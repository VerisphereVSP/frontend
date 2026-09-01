# Terms of Service

**[COMPANY NAME], Inc.**, a Delaware corporation ("Company," "we," "us")
**Version:** 2.0 (draft)
**Effective Date:** [DATE — set to mainnet genesis]
**Contact:** info@verisphere.co

> ⚠ **DRAFT — NOT YET IN EFFECT.** Version 2.0 reflects the corporate structure
> (Delaware corporation as operator) and the launch architecture: trading on a public
> permissionless AMM — the Company operates no market maker, quotes no prices, and
> custodies no user funds — with the token supply created in a single genesis mint
> to the Corporation's treasury. DRAFT prepared without counsel; not reviewed by an
> attorney. Bracketed items must be completed, and the restricted-jurisdictions
> list finalized, before publication. Supersedes the v1 draft in its entirety.

---

## 1. Acceptance of Terms

By accessing or using the Verisphere platform (the "Service"), you agree to be bound
by these Terms of Service ("Terms"). If you do not agree, do not use the Service.

## 2. Description of Service

Verisphere is a truth-staking protocol: an open-source set of smart contracts deployed
on the Avalanche blockchain (the "Protocol"). The Service is a web-based interface for
interacting with the Protocol. Through the Service, you can:

- Browse and search factual claims and topic articles
- Create factual claims on-chain
- Stake VSP tokens to support or challenge claims
- Create evidence links between claims

The Service does **not** sell, buy, or exchange tokens. See Section 6.

## 3. Eligibility; Geographic Restrictions

You must be at least 18 years old to use the Service. By using the Service, you
represent and warrant that you meet this requirement and that you are not prohibited
from using the Service under any applicable law.

The Service (or portions of it) is not offered to, and may not be used by, persons
located in, resident in, or organized under the laws of jurisdictions on the
Company's restricted list, which the Company may update from time to time and which
is published at [URL]. [RESTRICTED-JURISDICTIONS LIST — PENDING FINALIZATION;
expected to include, at minimum, jurisdictions subject to comprehensive
sanctions.] You are responsible for compliance
with the laws of your own jurisdiction, and you represent that your use of the
Service is lawful where you are.

## 4. The Protocol vs. The Service

The Protocol is a set of open-source smart contracts on the Avalanche blockchain. The
Protocol is permissionless — anyone may interact with it directly using their own
tools, without the Service and without the Company.

The Company operates the Service as a convenience layer providing a user interface,
gasless transactions (meta-transactions), and content moderation. The Service is
separate from the Protocol. The Company does not control, own, or operate the
underlying blockchain, and once deployed, core Protocol parameters described in
Section 6 (including the emission schedule) are outside the Company's control.

## 5. Relay Service and Fees

The Service can submit blockchain transactions on your behalf through a relay
("meta-transactions"), paying gas fees so you don't need native AVAX tokens. A relay
fee of up to 0.5% of the transaction value in VSP may be charged for this service.
The relay submits your own signed instructions; it does not take custody of your
tokens or act as your agent for trading.

You are not required to use the relay. You may interact with the Protocol contracts
directly using your own wallet and pay your own gas fees.

## 6. VSP Tokens

VSP is a utility token used within the Protocol for staking on claims. VSP is **not**
offered or promoted as an investment, and the Company makes no representation that
VSP is a security, commodity, or other regulated instrument in any jurisdiction — nor
that it is not; regulatory treatment is uncertain.

**6.1 The Company does not sell or exchange VSP.** The Service provides no buying,
selling, or exchange functionality. To the extent VSP trades at all, it trades on
third-party, permissionless automated market maker ("AMM") protocols that the Company
does not own, operate, or control. Any interface link from the Service to such a
venue is provided for convenience only. Your use of any AMM or other venue is at your
own risk and subject to that venue's terms and mechanics (including slippage and
fees).

**6.2 One-time supply creation; no discretionary minting.** The entire VSP supply
(other than adjustments made by the Protocol's staking mechanics, described below)
was created in a single mint at deployment. A portion is held subject to an on-chain
vesting contract with a fixed, publicly verifiable release schedule. The token's
supply cap is fixed at the genesis amount: the deployed code does not permit the
Company — or anyone else — to mint additional tokens, and the Company holds no
discretionary minting authority. The Protocol's StakeEngine adjusts supply only as a
mechanical consequence of staking outcomes (symmetric, rate-bounded gains and
losses); these adjustments are not directed by the Company. This description is a
statement of how the deployed code works, not a promise of value: **fixed supply
mechanics do not make VSP valuable, liquid, or safe.**

**6.3 No price support; no buyback; no liquidity commitment.** The Company does not
support, defend, stabilize, or guarantee any price for VSP; operates no buyback or
redemption program; and has no obligation to provide, maintain, or continue market
liquidity. Any liquidity position the Company holds in any AMM pool (including any
initial seed) is discretionary, may change or be withdrawn, and is not a commitment
to you. There is no floor price. Nothing in the Service, the documentation, or any
communication by the Company shall be construed as a promise, guarantee, or
obligation to maintain any price or liquidity for, or to repurchase, VSP.

**6.4 Risk acknowledgment.** By acquiring, holding, or staking VSP you acknowledge:

- You may lose all tokens you stake, and VSP may become worthless and/or impossible
  to sell. Total loss is possible.
- Token markets may be thin; small trades may move the price substantially; quoted
  prices at any moment may not be realizable.
- Past performance of claims, staking positions, or the token does not indicate
  future results.
- The Protocol's smart contracts have **not been audited by a third party** as of the
  effective date; they may contain defects that result in loss of funds.

## 7. Staking Risks

When you stake VSP on a claim, those tokens are locked in a smart contract. You may
lose staked tokens if the claim's Verity Score moves against your position, if the
Protocol's scoring mechanics redistribute stakes, or if a smart-contract
vulnerability results in loss of funds. Staking outcomes are determined by Protocol
mechanics operating on the aggregate behavior of participants; the Company takes no
position in claims, sets no odds, and is not your counterparty.

The Company is not responsible for losses resulting from staking, Protocol mechanics,
smart-contract defects, or blockchain network issues.

## 8. Content Policy

You may not use the Service to create or distribute content that:

- Contains hate speech, slurs, or calls for violence against any group
- Is sexually explicit or pornographic
- Sexualizes minors in any way
- Contains direct threats of violence against individuals or groups
- Provides instructions for creating weapons, explosives, or dangerous substances
- Contains private personal information (doxxing)

The Company reserves the right to refuse relay service for content that violates this
policy and to filter such content from display. Content that exists on the blockchain
but violates this policy may be hidden from the Service interface.

You are solely responsible for the content you create. Claims exist permanently on
the blockchain and cannot be deleted.

## 9. Content Moderation

The Service employs automated content moderation at two points: before relaying
transactions and when displaying content. Moderation decisions are made by automated
systems and may contain errors. The Company is not liable for content that passes
moderation or for content that is incorrectly blocked.

The blockchain itself is unmoderated. Content created by users interacting directly
with the Protocol contracts (bypassing the Service) is not subject to our content
policy but may be filtered from display.

## 10. Intellectual Property

The Protocol contracts are open-source software licensed under the MIT License. The
Verisphere relay and forwarder contract are licensed under the Business Source
License 1.1 (BUSL-1.1). "VERISPHERE" and associated marks are trademarks of the
Company.

Claims created by users are user-generated content. The Company does not claim
ownership of user-created claims.

## 11. Taxes

You are solely responsible for determining and paying any taxes that apply to your
transactions, staking activity, and token holdings. The Company provides no tax
advice and does not withhold or report on your behalf except where required by law.

## 12. Disclaimer of Warranties

THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. THE
COMPANY DISCLAIMS ALL WARRANTIES, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

## 13. Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE COMPANY SHALL NOT BE LIABLE FOR ANY
INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR
USE OF THE SERVICE OR THE PROTOCOL, INCLUDING LOSS OF TOKENS, LOSS OF DATA, OR LOSS
OF PROFITS, AND THE COMPANY'S AGGREGATE LIABILITY SHALL NOT EXCEED THE GREATER OF
$100 OR THE FEES YOU PAID TO THE COMPANY IN THE TWELVE MONTHS PRECEDING THE CLAIM.

## 14. Indemnification

You agree to indemnify and hold harmless the Company and its officers, directors, and
agents from any claims, damages, and expenses (including reasonable attorneys' fees)
arising from your use of the Service, your content, your violation of these Terms, or
your violation of applicable law.

## 15. Governing Law; Forum

These Terms are governed by the laws of the State of Delaware, United States, without
regard to conflict-of-law principles. Any dispute arising out of or relating to these
Terms or the Service shall be brought exclusively in the state or federal courts
located in the State of Delaware, and you consent to their personal jurisdiction.
[COUNSEL DECISION: whether to substitute binding arbitration with class-action
waiver; not included in this draft.]

## 16. General

If any provision of these Terms is held unenforceable, the remainder shall remain in
effect. These Terms are the entire agreement between you and the Company regarding
the Service. You may not assign these Terms; the Company may assign them in
connection with a merger, acquisition, or sale of assets. The Company's failure to
enforce any provision is not a waiver.

## 17. Changes to Terms

The Company may modify these Terms at any time. Continued use of the Service after
changes constitutes acceptance of the modified Terms.

## 18. Contact

For questions about these Terms, contact: **info@verisphere.co**
