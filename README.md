# Rootstock Paymaster Kit (ERC-4337)

A complete, production-ready toolkit for implementing ERC-4337 Account Abstraction and gasless transactions on the **Rootstock (RSK)** network.

Currently, developers wanting gasless transactions on Rootstock are often confused between the legacy RIF Relay system and the modern ERC-4337 standard. This project resolves that confusion by providing a pure, ERC-4337 implementation. 

It contains a `VerifyingPaymaster` specifically tuned for Rootstock, demonstrating how to sponsor gas for users in exchange for a custom ERC-20 token. This allows users to pay for gas in stablecoins (e.g., rUSD) or app tokens instead of RBTC.

---

## 🌟 Features

- **✅ Pure ERC-4337 implementation:** Uses standard `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` EntryPoint architecture.
- **🪙 ERC-20 Gas Payments:** Includes `MockToken.sol` to simulate paying for gas with alternative tokens.
- **✍️ Off-chain Verifying Paymaster:** A TypeScript service that signs UserOps off-chain, enabling custom business logic for gas sponsorship.
- **⚡ Direct `handleOps` Execution:** Bypasses complex bundler setups for testing directly via an EOA against the Rootstock Testnet.
- **🛠️ Foundry & Viem:** Built with modern, blazing-fast web3 tooling.

---

## 📖 RIF Relay vs. ERC-4337

When building on Rootstock, developers often encounter two models for gas abstraction:

1. **RIF Relay (Legacy / Protocol Specific):** Rootstock's custom envelope relaying system. It requires specific smart contract alterations (`IRelayRecipient`), a relayer network, and relies heavily on custom EIP-712 signatures wrapping native transactions.
2. **ERC-4337 (Modern Standard):** The Ethereum-wide standard for Account Abstraction. It uses a universal `EntryPoint` contract, standard `UserOperation` structs, and decentralized Bundlers. 

**Why use ERC-4337?**
- **No changes to target contracts:** You don't need to inherit `ERC2771Context` or `IRelayRecipient` in your dApps.
- **Smart Accounts:** It allows users to have programmable accounts (multisig, social recovery, session keys) rather than just EOAs.
- **Ecosystem Compatibility:** Tooling (like `viem`, `permissionless.js`, `pimlico`) works across all EVM chains.

This kit uses **ERC-4337** to completely future-proof your Rootstock dApps.

---

## 🚀 Quick Start

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
forge install
```

### 3. Environment Setup

Create a `.env` file based on the provided configurations:

```env
# Network
RSK_TESTNET_RPC_URL="https://public-node.testnet.rsk.co"

# Wallets
WALLET_PRIVATE_KEY="0x..."       # The deployer & bundler EOA (Needs tRBTC)
USER_PRIVATE_KEY="0x..."         # The Smart Account owner EOA (Needs 0 tRBTC)
PAYMASTER_SIGNER_KEY="0x..."     # Backend key that signs sponsorships

# Contract Addresses (Populate after deployment)
ENTRY_POINT_ADDRESS="0xffb454b2b45e01051C745d031eE2CeD0191d2544" # Standard v0.6 EntryPoint
FACTORY_ADDRESS="0x..."
PAYMASTER_ADDRESS="0x..."

# For the Paymaster constructor
PAYMASTER_OWNER="0x..."          # Public address of WALLET_PRIVATE_KEY
PAYMASTER_VERIFIER="0x..."       # Public address of PAYMASTER_SIGNER_KEY
```

### 4. Deployment

Deploy the `SimpleAccountFactory` and the `VerifyingPaymaster` (which also deploys the `MockToken`):

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

## 📊 It Works!

Here is the exact output from a successful gasless execution on Rootstock Testnet:

```text
═══════════════════════════════════════════════════
  ERC-4337 UserOp Execution on RSK Testnet
═══════════════════════════════════════════════════

--- Pre-flight Checks ---
Account deployed: true
Paymaster deposit: 0.000098419616427004 RBTC
Account nonce:   1
Current gas price: 7695377 wei

Paymaster data attached (length): 260
UserOp hash: 0xc313a527b7d818060dd87b3d95b8190367028e97ede8b241b7ff1b5034dffe4d

🚀 Submitting via direct handleOps...
Tx hash: 0xe9be9a6841a1a8a851d4c313ee2c34770776f691793d1db3d1843a59a8a77e07
Waiting for receipt...

═══════════════════════════════════════════════════
  Status: success
  Block:  7375661n
  Gas:    166420
  Logs:   4
═══════════════════════════════════════════════════

✅ UserOp executed successfully!
   View: https://explorer.testnet.rootstock.io/tx/0xe9be9a6841a1a8a851d4c313ee2c34770776f691793d1db3d1843a59a8a77e07
```

---

## 🏗️ Architecture & Scope

This repository provides:
1. **Solidity Contracts:**
   - `VerifyingPaymaster.sol`: Inheriting from OpenZeppelin and `BasePaymaster` paradigms, adapted specifically for Rootstock's `0.8.20` requirements.
   - `MockToken.sol`: A simple ERC-20 contract allowing the user to pay gas fees in a token of their choice.
2. **The "Sponsor" Script:**
   - A fully typed TypeScript service (`paymasterService.ts` & `executeUserOp.ts`) utilizing `viem`. 
   - Constructs a valid v0.6 `UserOperation`.
   - Hashes it and signs it with the backend Verifier key to authorize gas sponsorship.
3. **Bundler Integrations (Optional):**
   - While the provided `executeUserOp.ts` acts as a direct EOA bundler (via `handleOps`) for easy testing, the generated `UserOperation` complies with `eth_sendUserOperation`. 
   - Rootstock integration with bundlers like Pimlico/Stackup simply require pointing the RPC to their URL with Chain ID `31` (Testnet) or `30` (Mainnet).

## 📄 License
MIT
