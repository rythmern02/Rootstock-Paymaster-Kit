![Rootstock Banner](https://raw.githubusercontent.com/rsksmart/devportal/main/rootstock-logo.png)

# Rootstock Paymaster Kit (ERC-4337)

A production-ready toolkit for implementing ERC-4337 Account Abstraction and gasless transactions on the **Rootstock (RSK)** network. Users pay for gas with an ERC-20 token (e.g. rUSD) instead of RBTC.

> *IMPORTANT*
> This kit targets **ERC-4337 v0.7** (`PackedUserOperation` / `BasePaymaster`). Ensure your EntryPoint deployment is also v0.7.

---

## Why ERC-4337 on Rootstock?

| | RIF Relay (Legacy) | ERC-4337 (This Kit) |
|---|---|---|
| Target contract changes | Required (`IRelayRecipient`) | None |
| Smart accounts | No | Yes |
| Standard tooling (viem, permissionless) | Limited | Full |
| Bundler ecosystem | Custom | Universal |

---

## Features

- **Pure ERC-4337 v0.7 Implementation:** Uses standard `0x87fa7375e1caf5dc8b65e4094a84fdcd30cbdcd0` EntryPoint architecture (`PackedUserOperation`, `BasePaymaster`, correct `_postOp` 4-param override).
- **ERC-20 Gas Payments:** Includes `MockToken.sol` to simulate paying for gas with alternative tokens. Users pay gas in any ERC-20 token.
- **Off-chain Verifying Paymaster:** A TypeScript service that signs UserOps off-chain, enabling custom business logic for gas sponsorship, configurable validity window, and per-sender nonce replay protection.
- **Direct `handleOps` Execution:** Bypasses complex bundler setups for testing directly via an EOA against the Rootstock Testnet.
- **Foundry & Viem:** Built with modern, blazing-fast web3 tooling.
- **Production hardened:** Exchange-rate bounds, events, role separation (owner ≠ signer), timeout-guarded receipt waits.

---

## 🌍 Deployed Addresses (Rootstock Testnet)

The kit is currently live and tested on the Rootstock Testnet.

| Contract | Address | Block Explorer |
|---|---|---|
| **ERC-4337 EntryPoint (v0.7)** | `0x87fa7375e1caf5dc8b65e4094a84fdcd30cbdcd0` | [View on Explorer](https://explorer.testnet.rootstock.io/address/0x87fa7375e1caf5dc8b65e4094a84fdcd30cbdcd0) |
| **SimpleAccountFactory** | `0x00e425c915915ba5b6b196b65e27850e0081b2ec` | [View on Explorer](https://explorer.testnet.rootstock.io/address/0x00e425c915915ba5b6b196b65e27850e0081b2ec) |
| **MockToken (Gas Token)** | `0x3574f6a5ab7ce7edd3f8418f3f845f796acbf42b` | [View on Explorer](https://explorer.testnet.rootstock.io/address/0x3574f6a5ab7ce7edd3f8418f3f845f796acbf42b) |
| **VerifyingPaymaster** | `0xcbd0fe917137cccdc99f3d2bcc6129652587ebb4` | [View on Explorer](https://explorer.testnet.rootstock.io/address/0xcbd0fe917137cccdc99f3d2bcc6129652587ebb4) |

---

## Quick Start

### Prerequisites

- Node.js ≥ 18, [Foundry](https://getfoundry.sh/)
- tRBTC from [Rootstock Faucet](https://faucet.rootstock.io/)

### Installation

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

### Environment Setup

```env
# Network
RSK_TESTNET_RPC_URL="https://public-node.testnet.rsk.co"

# Wallets  — use DIFFERENT keys for coordinator/owner and the signer!
WALLET_PRIVATE_KEY="0x..."         # Deployer & bundler EOA (needs tRBTC)
USER_PRIVATE_KEY="0x..."           # Smart Account owner EOA
PAYMASTER_SIGNER_KEY="0x..."       # Backend key that signs sponsorships (MUST differ from owner)

# Contract Addresses (populate after deployment)
ENTRY_POINT_ADDRESS="0x..."        # ERC-4337 v0.7 EntryPoint on RSK
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

### Deployment

```bash
# Deploy paymaster (uses existing token if TOKEN_ADDRESS is set, else deploys MockToken)
forge script script/DeployPaymaster.s.sol --rpc-url $RSK_TESTNET_RPC_URL --broadcast

# Update .env with deployed addresses, then run setup
npm run setup

# Execute a gasless UserOp
npm run execute:op
```

---

## EntryPoint on Rootstock

> [!NOTE]
> The canonical ERC-4337 v0.7 EntryPoint may not yet be officially deployed on Rootstock Testnet/Mainnet. In that case, deploy a fresh copy from the [eth-infinitism/account-abstraction](https://github.com/eth-infinitism/account-abstraction) repo at tag `v0.7.0`, then set `ENTRY_POINT_ADDRESS` accordingly.
>
> The canonical v0.6 EntryPoint (`0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`) is **incompatible** with this kit's v0.7 contracts.

---

## 🏗️ Architecture

```
src/
  core/VerifyingPaymaster.sol  — ERC-4337 paymaster with per-sender nonce replay protection
  mock/MockToken.sol           — Owner-gated ERC-20 (testnet only)
script/
  DeployPaymaster.s.sol        — Deploy with TOKEN_ADDRESS support, enforces owner≠signer
offchain/
  paymasterService.ts          — Signs UserOps; reads paymasterNonce on-chain
  executeUserOp.ts             — Builds and submits UserOps
  setupPaymaster.ts            — One-time funding/approval setup
test/
  VeryfingPaymaster.t.sol      — Original validation tests
  VerifyingPaymasterBugs.t.sol — Regression suite for all 26 bug fixes
```

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
