![Rootstock Banner](https://raw.githubusercontent.com/rsksmart/devportal/main/rootstock-logo.png)

# Rootstock Paymaster Kit (ERC-4337)

A complete, production-ready toolkit for implementing ERC-4337 Account Abstraction and gasless transactions on the **Rootstock (RSK)** network.

Currently, developers wanting gasless transactions on Rootstock are often confused between the legacy RIF Relay system and the modern ERC-4337 standard. This project resolves that confusion by providing a pure, ERC-4337 implementation. 

It contains a `VerifyingPaymaster` specifically tuned for Rootstock, demonstrating how to sponsor gas for users in exchange for a custom ERC-20 token. This allows users to pay for gas in stablecoins (e.g., rUSD) or app tokens instead of RBTC.

---

## Features

- **Pure ERC-4337 v0.7 Implementation:** Uses standard `0x0000000071727De22E5E9d8BAf0edAc6f37da032` EntryPoint architecture (`PackedUserOperation`, `BasePaymaster`, correct `_postOp` 4-param override).
- **ERC-20 Gas Payments:** Includes `MockToken.sol` to simulate paying for gas with alternative tokens. Users pay gas in any ERC-20 token.
- **Off-chain Verifying Paymaster:** A TypeScript service that signs UserOps off-chain, enabling custom business logic for gas sponsorship, configurable validity window, and per-sender nonce replay protection.
- **Direct `handleOps` Execution:** Bypasses complex bundler setups for testing directly via an EOA against the Rootstock Testnet.
- **Foundry & Viem:** Built with modern, blazing-fast web3 tooling.
- **Production hardened:** Exchange-rate bounds, events, role separation (owner ≠ signer), timeout-guarded receipt waits.

---

## Deployed Addresses (Rootstock Testnet)

The kit is currently live and tested on the Rootstock Testnet.

| Contract | Address | Block Explorer |
|---|---|---|
| **ERC-4337 EntryPoint (v0.7)** | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | [View on Explorer](https://explorer.testnet.rootstock.io/address/0x0000000071727De22E5E9d8BAf0edAc6f37da032) |
| **SimpleAccountFactory** | `0x01735Dbf4c5521C3f4F1994e2287de101f35081A` | [View on Explorer](https://explorer.testnet.rootstock.io/address/0x01735Dbf4c5521C3f4F1994e2287de101f35081A) |
| **MockToken (Gas Token)** | `0x9E34A69515Ef2C2C07074EC6573CEbA63a15F1f9` | [View on Explorer](https://explorer.testnet.rootstock.io/address/0x9E34A69515Ef2C2C07074EC6573CEbA63a15F1f9) |
| **VerifyingPaymaster** | `0x6f944C5EDeb5629ca4972eEeb6aEf998bC11783A` | [View on Explorer](https://explorer.testnet.rootstock.io/address/0x6f944C5EDeb5629ca4972eEeb6aEf998bC11783A) |

> ✅ **All contracts are fully verified on the Rootstock Testnet Explorer!**
---

## RIF Relay vs. ERC-4337

When building on Rootstock, developers often encounter two models for gas abstraction:

1. **RIF Relay (Legacy / Protocol Specific):** Rootstock's custom envelope relaying system. It requires specific smart contract alterations (`IRelayRecipient`), a relayer network, and relies heavily on custom EIP-712 signatures wrapping native transactions.
2. **ERC-4337 (Modern Standard):** The Ethereum-wide standard for Account Abstraction. It uses a universal `EntryPoint` contract, standard `UserOperation` structs, and decentralized Bundlers. 

**Why use ERC-4337?**
- **No changes to target contracts:** You don't need to inherit `ERC2771Context` or `IRelayRecipient` in your dApps.
- **Smart Accounts:** It allows users to have programmable accounts (multisig, social recovery, session keys) rather than just EOAs.
- **Ecosystem Compatibility:** Tooling (like `viem` and bundler providers such as Pimlico, Alchemy, or Stackup) works across all EVM chains.

This kit uses **ERC-4337** to completely future-proof your Rootstock dApps.

---

## Quick Start

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Foundry](https://getfoundry.sh/)
- A Rootstock Testnet wallet funded with tRBTC from the [Rootstock Faucet](https://faucet.rootstock.io/).

### 2. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/your-username/rootstock-paymaster-kit.git
cd rootstock-paymaster-kit
npm install

# Pin submodules to audited, signed-release versions (required for reproducible builds).
# These exact tags are also pinned in .gitmodules (branch field) and foundry.lock.
git submodule update --init --recursive
cd lib/openzeppelin-contracts && git checkout v5.1.0  && cd ../..
cd lib/forge-std              && git checkout v1.15.0 && cd ../..
cd lib/account-abstraction    && git checkout v0.7.0  && cd ../..
```

### 3. Environment Setup

Create a `.env` file based on the provided configurations:

```env
# Network
RSK_TESTNET_RPC_URL="https://public-node.testnet.rsk.co"

# Wallets  — use DIFFERENT keys for coordinator/owner and the signer!
WALLET_PRIVATE_KEY="0x..."         # Deployer & bundler EOA (needs tRBTC)
USER_PRIVATE_KEY="0x..."           # Smart Account owner EOA (needs 0 tRBTC)
PAYMASTER_SIGNER_KEY="0x..."       # Backend key that signs sponsorships (MUST differ from owner)

# Contract Addresses (populate after deployment)
ENTRY_POINT_ADDRESS="0x0000000071727De22E5E9d8BAf0edAc6f37da032" # Canonical ERC-4337 v0.7 EntryPoint
FACTORY_ADDRESS="0x..."
PAYMASTER_ADDRESS="0x..."          # Required — no fallback
TOKEN_ADDRESS="0x..."              # Required — set after deploy

# Paymaster constructor roles (must be different addresses)
PAYMASTER_OWNER="0x..."            # Public address of WALLET_PRIVATE_KEY
PAYMASTER_VERIFIER="0x..."         # Public address of PAYMASTER_SIGNER_KEY

# Optional tuning
PAYMASTER_VALIDITY_SECONDS=1800    # Signature validity window (default 30 min)
BENEFICIARY_ADDRESS="0x..."        # Who receives bundler gas refunds
VERIFICATION_GAS_LIMIT=100000
POST_OP_GAS_LIMIT=100000
OP_VERIFY_GAS_DEPLOYED=200000
OP_VERIFY_GAS_NEW=500000
OP_CALL_GAS_LIMIT=200000
OP_PRE_VERIFY_GAS_DEPLOYED=60000
OP_PRE_VERIFY_GAS_NEW=100000
HANDLE_OPS_GAS=2000000
```

### 4. Deployment

Deploy the `SimpleAccountFactory` and the `VerifyingPaymaster` (which also deploys the `MockToken` if `TOKEN_ADDRESS` is absent):

```bash
forge script script/DeploySimpleAccountFactory.s.sol --rpc-url $RSK_TESTNET_RPC_URL --broadcast
forge script script/DeployPaymaster.s.sol --rpc-url $RSK_TESTNET_RPC_URL --broadcast
```
*Update your `.env` with the newly deployed addresses.*

### 5. Execution

Run the one-time off-chain setup to pre-fund the paymaster, deploy your smart account, and mint the ERC-20 tokens:

```bash
npm run setup
```

Execute a gasless `UserOperation`. The Smart Account will transfer tokens to a dummy address, and the gas will be entirely sponsored by the Paymaster!

```bash
npm run execute:op
```

---

## 📊 It Works!

Here is the exact output from a successful gasless execution on Rootstock Testnet using this kit:

```text
═══════════════════════════════════════════════════
  ERC-4337 UserOp Execution on RSK Testnet
═══════════════════════════════════════════════════

Smart Account:   0x5EEDc9aDc230c48b6EE10736b25cb4953022209f
Owner EOA:       0x4E7fA7958e7F63508409E0045FE61D495d09D6FD
Coordinator EOA: 0x18AF72239dD6a52426e4dd9509C6515Df06477E4
Beneficiary:     0x18AF72239dD6a52426e4dd9509C6515Df06477E4

--- Pre-flight Checks ---
Account deployed: true
Paymaster deposit: 0.0001 RBTC
Account nonce:   0

UserOp target:    0x1111111111111111111111111111111111111111
Current gas price: 26055176 wei

Paymaster data attached (length): 260
UserOp hash: 0x58d030c7398430955c9ac7cec0443d585798363ee7ebff33f17d5ff0d8e78be3

🚀 Submitting via direct handleOps...
Tx hash: 0x538d8f277f79c9be19e5e768806c3d2769b8eaf2a8184e304284268c54cdd689
Waiting for receipt...

═══════════════════════════════════════════════════
  Status: success
  Block:  7546176n
  Gas:    189210
  Logs:   4
═══════════════════════════════════════════════════

✅ UserOp executed successfully!
   View: https://explorer.testnet.rootstock.io/tx/0x538d8f277f79c9be19e5e768806c3d2769b8eaf2a8184e304284268c54cdd689
```

---

## Rootstock EntryPoint (v0.7)

> [!NOTE]
> This kit is fully integrated with the **Canonical ERC-4337 v0.7 EntryPoint** at its official unified deterministic address:
> `0x0000000071727De22E5E9d8BAf0edAc6f37da032`
>
> The canonical v0.6 EntryPoint (`0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`) is **incompatible** with this kit's v0.7 contracts.
>
> Using the Canonical v0.7 EntryPoint ensures maximum compatibility across all major bundler providers (e.g., Alchemy, Pimlico, Biconomy) and Smart Account frameworks.

---

## 🏗️ Architecture & Scope

This repository provides:
1. **Solidity Contracts:**
   - `core/VerifyingPaymaster.sol`: Inheriting from OpenZeppelin and `BasePaymaster` paradigms, adapted specifically for Rootstock's requirements with per-sender nonce replay protection.
   - `mock/MockToken.sol`: An owner-gated ERC-20 contract allowing the user to pay gas fees in a token of their choice (testnet only).
2. **The "Sponsor" Script:**
   - Fully typed TypeScript services (`paymasterService.ts`, `executeUserOp.ts`, `setupPaymaster.ts`) utilizing `viem`.
   - Constructs a valid v0.7 `PackedUserOperation`.
   - Hashes it and signs it with the backend Verifier key to authorize gas sponsorship.
3. **Bundler Integrations (Optional):**
   - While the provided `executeUserOp.ts` acts as a direct EOA bundler (via `handleOps`) for easy testing, the generated `UserOperation` complies with `eth_sendUserOperation`. 
   - Rootstock integration with bundlers like Pimlico/Stackup simply require pointing the RPC to their URL with Chain ID `31` (Testnet) or `30` (Mainnet).

---

## 🧪 Tests

```bash
npm test                                                 # Full test suite (Forge + TS typecheck)
forge test -vv                                           # All Solidity tests
forge test --match-path test/VerifyingPaymasterBugs.t.sol -vvv   # Bug regression suite
npx tsc --noEmit                                         # TypeScript type check
```

---

## 🔒 Security Notes

- **Owner ≠ Verifier** — The deploy script enforces different keys. A compromise of the signing key allows forged sponsorships; a compromise of the owner key allows fund withdrawal. Separating them limits blast radius.
- **Exchange rate bounds** — `MIN_RATE` / `MAX_RATE` prevent accidental free-sponsorship or extreme overcharging. Rate changes require a 1-day timelock and can be cancelled via `cancelExchangeRateUpdate()`.
- **Token approval model** — The paymaster charges tokens in `_postOp` (not validation), complying with ERC-4337 bundler opcode restrictions. Users must approve the paymaster before submitting UserOps. Setup uses bounded approval (100k tokens) to limit blast radius.
- **Replay protection** — `paymasterNonces[sender]` is incremented on every validated op, preventing within-window signature reuse.
- **Beneficiary address** — The `BENEFICIARY_ADDRESS` env var must be explicitly set and cannot be the zero address, preventing accidental burning of gas refunds.

### Bundler Staking (M-03)

> [!IMPORTANT]
> ERC-4337 requires paymasters that access associated storage (e.g., ERC-20 balances in `_postOp`) to maintain a stake with the EntryPoint. **Strict bundlers** (Pimlico, Alchemy, Stackup) enforce this and will reject UserOps from unstaked paymasters.
>
> The paymaster contract includes `addStake()`, `unlockStake()`, and `withdrawStake()` admin functions for this purpose:
>
> ```solidity
> // Stake 0.01 RBTC with a 1-day unlock delay
> paymaster.addStake{value: 0.01 ether}(86400);
> ```
>
> If you are using direct `handleOps` submission (as demonstrated in this project) or a permissive bundler, staking is not required but is still recommended for production deployments.

---

## 📄 License
MIT

