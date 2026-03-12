![Rootstock Banner](https://raw.githubusercontent.com/rsksmart/devportal/main/rootstock-logo.png)

# Rootstock Paymaster Kit (ERC-4337)

A complete, production-ready toolkit for implementing ERC-4337 Account Abstraction and gasless transactions on the **Rootstock (RSK)** network.

Currently, developers wanting gasless transactions on Rootstock are often confused between the legacy RIF Relay system and the modern ERC-4337 standard. This project resolves that confusion by providing a pure, ERC-4337 implementation. 

It contains a `VerifyingPaymaster` specifically tuned for Rootstock, demonstrating how to sponsor gas for users in exchange for a custom ERC-20 token. This allows users to pay for gas in stablecoins (e.g., rUSD) or app tokens instead of RBTC.

---

## Features

- **Pure ERC-4337 v0.7 Implementation:** Uses standard `0x87fa7375e1caf5dc8b65e4094a84fdcd30cbdcd0` EntryPoint architecture (`PackedUserOperation`, `BasePaymaster`, correct `_postOp` 4-param override).
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
| **ERC-4337 EntryPoint (v0.7)** | `0x87fa7375e1caf5dc8b65e4094a84fdcd30cbdcd0` | [View on Explorer](https://explorer.testnet.rootstock.io/address/0x87fa7375e1caf5dc8b65e4094a84fdcd30cbdcd0) |
| **SimpleAccountFactory** | `0x00e425c915915ba5b6b196b65e27850e0081b2ec` | [View on Explorer](https://explorer.testnet.rootstock.io/address/0x00e425c915915ba5b6b196b65e27850e0081b2ec) |
| **MockToken (Gas Token)** | `0x3574f6a5ab7ce7edd3f8418f3f845f796acbf42b` | [View on Explorer](https://explorer.testnet.rootstock.io/address/0x3574f6a5ab7ce7edd3f8418f3f845f796acbf42b) |
| **VerifyingPaymaster** | `0xcbd0fe917137cccdc99f3d2bcc6129652587ebb4` | [View on Explorer](https://explorer.testnet.rootstock.io/address/0xcbd0fe917137cccdc99f3d2bcc6129652587ebb4) |
---

## RIF Relay vs. ERC-4337

When building on Rootstock, developers often encounter two models for gas abstraction:

1. **RIF Relay (Legacy / Protocol Specific):** Rootstock's custom envelope relaying system. It requires specific smart contract alterations (`IRelayRecipient`), a relayer network, and relies heavily on custom EIP-712 signatures wrapping native transactions.
2. **ERC-4337 (Modern Standard):** The Ethereum-wide standard for Account Abstraction. It uses a universal `EntryPoint` contract, standard `UserOperation` structs, and decentralized Bundlers. 

**Why use ERC-4337?**
- **No changes to target contracts:** You don't need to inherit `ERC2771Context` or `IRelayRecipient` in your dApps.
- **Smart Accounts:** It allows users to have programmable accounts (multisig, social recovery, session keys) rather than just EOAs.
- **Ecosystem Compatibility:** Tooling (like `viem`, `permissionless.js`, `pimlico`) works across all EVM chains.

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

# Pin submodules to audited versions (required for reproducible builds)
git submodule update --init --recursive
cd lib/openzeppelin-contracts && git checkout v5.2.0 && cd ../..
cd lib/forge-std            && git checkout v1.9.4  && cd ../..
cd lib/account-abstraction  && git checkout v0.7.0  && cd ../..
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
ENTRY_POINT_ADDRESS="0x87fa7375e1caf5dc8b65e4094a84fdcd30cbdcd0" # ERC-4337 v0.7 EntryPoint on RSK
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

⚠️  BENEFICIARY_ADDRESS not set — using coordinator address as beneficiary.
   Set BENEFICIARY_ADDRESS in .env for production deployments.
Smart Account:   0x14feb32FECBd2f61DDe3956754ebFdD569e238fe
Owner EOA:       0x4E7fA7958e7F63508409E0045FE61D495d09D6FD
Coordinator EOA: 0x18AF72239dD6a52426e4dd9509C6515Df06477E4
Beneficiary:     0x18AF72239dD6a52426e4dd9509C6515Df06477E4

--- Pre-flight Checks ---
Account deployed: true
Paymaster deposit: 0.0001 RBTC
Account nonce:   0
Current gas price: 7503136 wei

Paymaster data attached (length): 260
UserOp hash: 0x1f397e993f9d9545f6257d28cfef3fc3908beffe902085d0eb078228f6a19c33

🚀 Submitting via direct handleOps...
Tx hash: 0x346ab199e52dd3dcf77a6eb9d37f78600f1a525f35f0a68b6e9b37ba015a7bff
Waiting for receipt...

═══════════════════════════════════════════════════
  Status: success
  Block:  7439546n
  Gas:    212748
  Logs:   4
═══════════════════════════════════════════════════

✅ UserOp executed successfully!
   View: https://explorer.testnet.rootstock.io/tx/0x346ab199e52dd3dcf77a6eb9d37f78600f1a525f35f0a68b6e9b37ba015a7bff
```

---

## Rootstock EntryPoint (v0.7)

> [!NOTE]
> The canonical ERC-4337 v0.7 EntryPoint may not yet be officially deployed on Rootstock Testnet/Mainnet. In that case, deploy a fresh copy from the [eth-infinitism/account-abstraction](https://github.com/eth-infinitism/account-abstraction) repo at tag `v0.7.0`, then set `ENTRY_POINT_ADDRESS` accordingly.
>
> The canonical v0.6 EntryPoint (`0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`) is **incompatible** with this kit's v0.7 contracts.

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
forge test -vv                                          # All tests
forge test --match-path test/VerifyingPaymasterBugs.t.sol -vvv   # Bug regression suite
npx tsc --noEmit                                        # TypeScript type check
```

---

## 🔒 Security Notes

- **Owner ≠ Verifier** — The deploy script enforces different keys. A compromise of the signing key allows forged sponsorships; a compromise of the owner key allows fund withdrawal. Separating them limits blast radius.
- **Exchange rate bounds** — `MIN_RATE` / `MAX_RATE` prevent accidental free-sponsorship or extreme overcharging.
- **Token approval model** — The paymaster charges tokens in `_postOp` (not validation), complying with ERC-4337 bundler opcode restrictions. Users must approve the paymaster before submitting UserOps.
- **Replay protection** — `paymasterNonces[sender]` is incremented on every validated op, preventing within-window signature reuse.

---

## 📄 License
MIT
