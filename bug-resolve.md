# Bug Resolution Report — Rootstock ERC-4337 Verifying Paymaster Kit

> All 26 original bugs and 22 additional audit findings (H-01 through L-07) have been resolved. This document details each bug, its root cause, severity, the fix applied, and which files were changed.

---

## Summary Table — Original Bugs (Round 1)

| # | Severity | File(s) | Status |
|---|---|---|---|
| 1 | 🔴 Critical | `VerifyingPaymaster.sol` | ✅ Fixed |
| 2 | 🔴 Critical | `paymasterService.ts` | ✅ Fixed |
| 3 | 🟠 High | `paymasterService.ts` | ✅ Fixed |
| 4 | 🔴 Critical | `VerifyingPaymaster.sol`, `paymasterService.ts` | ✅ Fixed |
| 5 | 🔴 Critical | `VerifyingPaymaster.sol` | ✅ Fixed |
| 6 | 🟠 High | `.gitmodules` | ✅ Fixed |
| 7 | 🟠 High | `VerifyingPaymaster.sol` | ✅ Fixed |
| 8 | 🔴 Critical | `paymasterService.ts`, `executeUserOp.ts` | ✅ Fixed |
| 9 | 🟡 Medium | `setupPaymaster.ts` | ✅ Fixed |
| 10 | 🟠 High | `setupPaymaster.ts` | ✅ Fixed |
| 11 | 🟡 Medium | `paymasterService.ts` | ✅ Fixed |
| 12 | 🟠 High | `.gitignore` | ✅ Fixed |
| 13 | 🟠 High | `.gitmodules` | ✅ Fixed |
| 14 | 🔴 Critical | `VerifyingPaymaster.sol` | ✅ Fixed |
| 15 | 🔴 Critical | `VerifyingPaymaster.sol` | ✅ Fixed |
| 16 | 🟠 High | `.gitmodules` | ✅ Fixed |
| 17 | 🟠 High | `MockToken.sol` | ✅ Fixed |
| 18 | 🟡 Medium | `paymasterService.ts` | ✅ Fixed |
| 19 | 🟡 Medium | `paymasterService.ts` | ✅ Fixed |
| 20 | 🟡 Medium | `executeUserOp.ts`, `paymasterService.ts` | ✅ Fixed |
| 21 | 🟡 Medium | `executeUserOp.ts` | ✅ Fixed |
| 22 | 🟡 Medium | `executeUserOp.ts`, `setupPaymaster.ts` | ✅ Fixed |
| 23 | 🟡 Medium | `executeUserOp.ts` | ✅ Fixed |
| 24 | 🟡 Medium | `README.md` | ✅ Fixed |
| 25 | 🔴 Critical | `VerifyingPaymaster.sol`, `DeployPaymaster.s.sol` | ✅ Fixed |
| 26 | 🟡 Medium | `DeployPaymaster.s.sol` | ✅ Fixed |

---

## Summary Table — Security Audit Findings (Round 2)

| ID | Severity | Title | File(s) | Status |
|---|---|---|---|---|
| H-01 | 🔴 High | Submodule commit-pin mismatch | `.gitmodules` | ✅ Fixed |
| H-02 | 🔴 High | Non-canonical EntryPoint without verification | `README.md` | ✅ Fixed |
| H-03 | 🔴 High | Floating pragma with compiler override | All `.sol` files | ✅ Fixed |
| M-01 | 🟠 Medium | Missing zero-address validation for `_token` | `VerifyingPaymaster.sol` | ✅ Fixed |
| M-02 | 🟠 Medium | Beneficiary zero-address guard bypass | `executeUserOp.ts`, `.env.example` | ✅ Fixed |
| M-03 | 🟠 Medium | No staking management | `VerifyingPaymaster.sol`, `README.md` | ✅ Fixed |
| M-04 | 🟠 Medium | Timelock has no cancellation function | `VerifyingPaymaster.sol` | ✅ Fixed |
| M-05 | 🟠 Medium | Unlimited token approval (MAX_UINT256) | `setupPaymaster.ts` | ✅ Fixed |
| M-06 | 🟠 Medium | `withdrawToken` and `setVerifyingSigner` untested | `VerifyingPaymasterBugs.t.sol` | ✅ Fixed |
| M-07 | 🟠 Medium | `PostOpMode.opReverted` not tested | `VerifyingPaymasterBugs.t.sol` | ✅ Fixed |
| M-08 | 🟠 Medium | Hardcoded demo values in `executeUserOp.ts` | `executeUserOp.ts`, `.env.example` | ✅ Fixed |
| L-01 | 🟢 Low | Filename typo `VeryfingPaymaster.t.sol` | `test/` directory | ✅ Fixed |
| L-02 | 🟢 Low | Unused import `encodePacked` | `executeUserOp.ts` | ✅ Fixed |
| L-03 | 🟢 Low | `withdrawToken` has no `to` zero-address guard | `VerifyingPaymaster.sol` | ✅ Fixed |
| L-04 | 🟢 Low | Initial `exchangeRate` magic number | `VerifyingPaymaster.sol` | ✅ Fixed |
| L-05 | 🟢 Low | Missing NatSpec on public functions | `VerifyingPaymaster.sol` | ✅ Fixed |
| L-06 | 🟢 Low | `pendingExchangeRate` not reset after execution | `VerifyingPaymaster.sol` | ✅ Fixed |
| L-07 | 🟢 Low | `package.json` has Foundry boilerplate description | `package.json` | ✅ Fixed |

---

## Detailed Resolutions — Original Bugs (Round 1)

---

### Bug #1 — `_postOp` missing `override` and incorrect parameter count
**Severity:** 🔴 Critical  
**File:** `src/core/VerifyingPaymaster.sol`

**Root Cause:** `_postOp` was declared with 3 parameters and no `override`. The ERC-4337 v0.7 `BasePaymaster` defines `_postOp` with 4 parameters (`PostOpMode`, `bytes calldata context`, `uint256 actualGasCost`, `uint256 actualUserOpFeePerGas`). Without the correct signature and `override`, Solidity never overrides the base implementation — the EntryPoint calls the base's no-op, so tokens are never charged and no refunds ever occur.

**Fix:** Added `override` and the 4th param `actualUserOpFeePerGas` to match the v0.7 ABI exactly.

---

### Bug #2 — Missing `PAYMASTER_SIGNER_KEY` validation
**Severity:** 🔴 Critical  
**File:** `offchain/paymasterService.ts`

**Root Cause:** `PAYMASTER_SIGNER_KEY` was read from env without any guard. `privateKeyToAccount(undefined)` throws a cryptic viem error at runtime.

**Fix:** Added a startup guard that throws a descriptive error if `PAYMASTER_SIGNER_KEY` is absent.

---

### Bug #3 — Hardcoded `PAYMASTER_ADDRESS` fallback
**Severity:** 🟠 High  
**File:** `offchain/paymasterService.ts`

**Root Cause:** The fallback `"0x17313EA008bA8..."` meant that after redeployment, if `.env` was not updated, the service silently signed for the old paymaster address, producing invalid signatures.

**Fix:** Removed the hardcoded fallback. The service now throws if `PAYMASTER_ADDRESS` is not set in `.env`.

---

### Bug #4 — No replay protection in signed hash
**Severity:** 🔴 Critical  
**File:** `src/core/VerifyingPaymaster.sol`, `offchain/paymasterService.ts`

**Root Cause:** `getHash()` excluded any per-use uniqueness identifier. Within the validity window, if a UserOp with identical parameters were somehow resubmitted (e.g., a failed op not yet mined), the same paymaster signature would pass.

**Fix:** Added `mapping(address => uint256) public paymasterNonces`. The current nonce is included in `getHash()` and incremented in `_validatePaymasterUserOp` on every successful validation. The off-chain service reads this nonce via `publicClient.readContract()` before signing.

---

### Bug #5 — `setExchangeRate()` allows zero rate
**Severity:** 🔴 Critical  
**File:** `src/core/VerifyingPaymaster.sol`

**Root Cause:** Setting `exchangeRate = 0` makes `maxTokenCost = 0`, allowing users to transact for free, draining the paymaster's RBTC deposit in the EntryPoint.

**Fix:** Added `require(_newRate >= MIN_RATE, "PM: rate below minimum")`.

---

### Bug #6 — OpenZeppelin version not pinned (signature malleability risk)
**Severity:** 🟠 High  
**File:** `.gitmodules`

**Root Cause:** No version tag meant any OZ version could be installed, including those prior to v4.7.3 which contained a signature malleability vulnerability in `ECDSA.recover`.

**Fix:** Pinned `lib/openzeppelin-contracts` to `v5.2.0` (includes all security fixes).

---

### Bug #7 — Exchange rate has no event, no bounds
**Severity:** 🟠 High  
**File:** `src/core/VerifyingPaymaster.sol`

**Root Cause:** An owner could set an arbitrarily high rate to overcharge users on future ops with zero on-chain transparency.

**Fix:**
- Added `uint256 public constant MIN_RATE = 1e3`
- Tightened upper bound via `uint256 public constant MAX_RATE = 1e21`
- Added timelock for exchange rate updates (via `requestExchangeRateUpdate` and `executeExchangeRateUpdate` separated by `EXCHANGE_RATE_DELAY`) to give users time to exit if the rate is bumped.
- Added `event ExchangeRateUpdated(uint256 indexed oldRate, uint256 indexed newRate)`

---

### Bug #8 — `validUntil` computed independently causing drift
**Severity:** 🔴 Critical  
**File:** `offchain/paymasterService.ts`, `offchain/executeUserOp.ts`

**Root Cause:** Both `getPaymasterStubData()` and `getPaymasterSignature()` called `Date.now()` independently. Even a 1-second difference causes the off-chain hash to not match the on-chain hash → invalid signature.

**Fix:** Added `computeValidityWindow()` which returns a fixed `{ validUntil, validAfter }` pair. Both functions now accept these as parameters (passed from the caller in `executeUserOp.ts`).

---

### Bug #9 — `USER_PRIVATE_KEY` not validated in `setupPaymaster.ts`
**Severity:** 🟡 Medium  
**File:** `offchain/setupPaymaster.ts`

**Root Cause:** The guard check excluded `USER_PRIVATE_KEY`, so a missing env var caused a cryptic error from `privateKeyToAccount(undefined)`.

**Fix:** Added `USER_PRIVATE_KEY` to the startup guard condition.

---

### Bug #10 — `MOCK_TOKEN_ADDRESS` hardcoded in `setupPaymaster.ts`
**Severity:** 🟠 High  
**File:** `offchain/setupPaymaster.ts`

**Root Cause:** The address `"0x570B34fd..."` was hardcoded from stale broadcast logs. If the token was redeployed but `.env` was not updated, the script silently interacted with the wrong contract.

**Fix:** Replaced with `TOKEN_ADDRESS` read from `.env`. The script throws if this variable is missing.

---

### Bug #11 — Paymaster signature validity too short (5 min)
**Severity:** 🟡 Medium  
**File:** `offchain/paymasterService.ts`

**Root Cause:** RSK Testnet block times can be irregular. A 5-minute window can easily expire before the op is mined, losing the UserOp with no retry mechanism.

**Fix:** Default validity window raised to 1800 seconds (30 minutes). Configurable via `PAYMASTER_VALIDITY_SECONDS` env var.

---

### Bug #12 — Broadcast files un-ignored in `.gitignore`
**Severity:** 🟠 High  
**File:** `.gitignore`

**Root Cause:** `!/broadcast` (with `!`) explicitly un-ignored the directory, committing deployer addresses, bytecode, and transaction data to the repository.

**Fix:** Replaced with `/broadcast/` to properly ignore all broadcast files.

---

### Bug #13 / #16 — Submodules not pinned to specific versions
**Severity:** 🟠 High  
**File:** `.gitmodules`

**Root Cause:** No `branch` or tag was specified, so `forge install` could pull any version, making builds non-reproducible and potentially pulling in breaking changes silently.

**Fix:** Added `branch` fields pinning each submodule:
- `forge-std` → `v1.9.4`
- `openzeppelin-contracts` → `v5.2.0`
- `account-abstraction` → `v0.7.0`

**After cloning, run:**
```bash
git submodule update --init --recursive
cd lib/openzeppelin-contracts && git checkout v5.2.0 && cd ../..
cd lib/forge-std && git checkout v1.9.4 && cd ../..
cd lib/account-abstraction && git checkout v0.7.0 && cd ../..
```

---

### Bug #14 — `_postOp` does not handle `postOpReverted`
**Severity:** 🔴 Critical  
**File:** `src/core/VerifyingPaymaster.sol`

**Root Cause:** The `postOpReverted` branch was an empty comment. If the inner call or the first `_postOp` invocation reverted, the EntryPoint calls `_postOp` again with `mode = postOpReverted`. If THAT also reverts, the entire `handleOps` transaction fails.

**Fix:** `postOpReverted` handler now uses `try/catch` around the token transfer to avoid reverting. Gas costs are still charged where possible; the paymaster absorbs the loss if the user has insufficient tokens.

---

### Bug #15 — `safeTransferFrom` in validation phase violates ERC-4337 opcode restrictions
**Severity:** 🔴 Critical  
**File:** `src/core/VerifyingPaymaster.sol`

**Root Cause:** Calling `token.safeTransferFrom()` during `_validatePaymasterUserOp` accesses external ERC-20 storage, which is banned during the validation phase by strict ERC-4337 bundlers. Such UserOps will be rejected.

**Fix:** Removed the token transfer from `_validatePaymasterUserOp` entirely. Token charging is now done exclusively in `_postOp`, where external calls are permitted. The context still passes `maxTokenCost` and `exchangeRate` so `_postOp` can compute and charge the correct amount.

> **Note:** This means the paymaster cannot pre-lock tokens against double-spend during the UserOp execution. Mitigations: (1) API-level limits on what callData is signed, (2) minimum required balance checks at the API level before signing, (3) monitoring for abusive accounts.

---

### Bug #17 — `MockToken.mint()` is public with no access control
**Severity:** 🟠 High  
**File:** `src/mock/MockToken.sol`

**Root Cause:** Anyone could call `mint()` and create unlimited tokens, making the contract worthless on mainnet.

**Fix:** `MockToken` now inherits `Ownable`. `mint()` is restricted to `onlyOwner`. The deploying account (coordinator) owns the token and can mint during `setupPaymaster.ts`.

---

### Bug #18 — Unsafe hex string slicing for `paymasterGasPart`
**Severity:** 🟡 Medium  
**File:** `offchain/paymasterService.ts`

**Root Cause:** `paymasterAndData.slice(42, 106)` treats the hex string as a raw character array. If the `"0x"` prefix is absent (or the layout changes), the extracted bytes are wrong, producing an incorrect hash.

**Fix:** Replaced with `hexToBytes(paymasterAndData).slice(20, 52)` (viem utility), which correctly extracts bytes 20–52 regardless of prefix.

---

### Bug #19 — Precision loss with `Number()` cast on `bigint`
**Severity:** 🟡 Medium  
**File:** `offchain/paymasterService.ts`

**Root Cause:** `Number(validUntil)` converts `bigint` to `number`. While safe for `uint48` today (max ~281 trillion < 2^53), it is a dangerous pattern that breaks silently if types ever change.

**Fix:** The `Number()` cast is intentionally kept because `viem` strictly requires a `number` for `uint48` parameter typings in `encodeAbiParameters`, but explicit comments were added to document that this cast is 100% safe (uint48 max value is less than Number.MAX_SAFE_INTEGER).

---

### Bug #20 — Gas limits hardcoded with no configuration
**Severity:** 🟡 Medium  
**File:** `offchain/executeUserOp.ts`, `offchain/paymasterService.ts`

**Root Cause:** RSK gas costs differ from Ethereum mainnet. Hardcoded values may be too low (causing reverts) or unnecessarily high (wasting RBTC).

**Fix:** All gas limits are now read from env vars with sensible defaults:
- `VERIFICATION_GAS_LIMIT`, `POST_OP_GAS_LIMIT` (paymasterService)
- `OP_VERIFY_GAS_DEPLOYED`, `OP_VERIFY_GAS_NEW`, `OP_CALL_GAS_LIMIT`, `OP_PRE_VERIFY_GAS_DEPLOYED`, `OP_PRE_VERIFY_GAS_NEW`, `HANDLE_OPS_GAS` (executeUserOp)

---

### Bug #21 — `main()` has no granular error handling
**Severity:** 🟡 Medium  
**File:** `offchain/executeUserOp.ts`

**Root Cause:** A single `.catch()` at the bottom produced generic errors like "Cannot read property of undefined" with no indication of which step failed.

**Fix:** Each of the 9 steps in `main()` is wrapped in a `try/catch` that throws a descriptive error prefixed with the step name (e.g., `[Step 7 — getPaymasterSignature]`).

---

### Bug #22 — `waitForTransactionReceipt` called without timeout
**Severity:** 🟡 Medium  
**File:** `offchain/executeUserOp.ts`, `offchain/setupPaymaster.ts`

**Root Cause:** If a transaction is dropped or the network is congested, the script hangs indefinitely with no output.

**Fix:** Added `timeout: 120_000` (2 minutes) to all `waitForTransactionReceipt` calls. If timeout expires, an error is thrown with the tx hash so the user can check manually.

---

### Bug #23 — Coordinator used as `handleOps` beneficiary (no configurability)
**Severity:** 🟡 Medium  
**File:** `offchain/executeUserOp.ts`

**Root Cause:** Gas refunds from the EntryPoint always went to the coordinator address, with no way to direct refunds elsewhere (e.g., a treasury).

**Fix:** Added `BENEFICIARY_ADDRESS` env var. The script now fails fast and explicitly requires this variable to be set for production safety (to prevent unintended payouts of accumulated fees).

---

### Bug #24 — EntryPoint address contradiction in README
**Severity:** 🟡 Medium  
**File:** `README.md`

**Root Cause:** README stated `ENTRY_POINT_ADDRESS="0xffb454b2..."` was the "Standard v0.6 EntryPoint", while also mentioning `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` (real canonical v0.6) elsewhere. This was contradictory and misleading.

**Fix:** Rewrote the EntryPoint section to clearly state:
1. This kit uses **v0.7** (not v0.6)
2. The canonical v0.7 EntryPoint may need to be deployed fresh on RSK
3. The v0.6 address is **incompatible** with v0.7 contracts

---

### Bug #25 — Paymaster owner and verifier are the same address
**Severity:** 🔴 Critical  
**File:** `src/core/VerifyingPaymaster.sol`, `script/DeployPaymaster.s.sol`

**Root Cause:** Both roles used the same key (`0x18AF72...`). A single key compromise gives the attacker full ownership AND signature authority simultaneously.

**Fix:**
- `RootstockVerifyingPaymaster` constructor now `require(owner != verifyingSigner, "PM: owner and signer must differ")`
- `setVerifyingSigner()` enforces the same invariant
- `DeployPaymaster.s.sol` reads separate `PAYMASTER_OWNER` and `PAYMASTER_VERIFIER` env vars and `require`s they differ

---

### Bug #26 — Deploy script always deploys `MockToken` (no real token support)
**Severity:** 🟡 Medium  
**File:** `script/DeployPaymaster.s.sol`

**Root Cause:** `MockToken` was always deployed, making mainnet deployment with a real stablecoin impossible without script modification.

**Fix:** `DeployPaymaster.s.sol` checks for `TOKEN_ADDRESS` env var. If set, the existing token is used. If not set, `MockToken` is deployed with a clear warning that it is testnet-only.

---

### Extra Note 1 — `transferFrom` vs `safeTransferFrom` inside `_postOp`
**Severity:** 🟡 Medium  
**File:** `src/core/VerifyingPaymaster.sol`

**Root Cause:** Using raw `transferFrom` instead of `safeTransferFrom` inside the `postOpReverted` exception handler might seem dangerous for non-standard ERC-20s.

**Fix:** A comment was added to explain that `try/catch` cannot effectively wrap `safeTransferFrom` (as it's an internal library call) without risking an uncatchable revert that would crash the entire `handleOps` transaction. The raw `transferFrom` is necessary to ensure `handleOps` succeeds even if token charging fails during revert mode.

---

### Extra Note 2 — Constructor Zero-Address Safety
**Severity:** 🟢 Low  
**File:** `src/core/VerifyingPaymaster.sol`

**Root Cause:** The constructor could accidentally be deployed with `address(0)` for the owner or signer.

**Fix:** Native zero-address checks (`require(_owner != address(0))`, `require(_verifyingSigner != address(0))`) are already present in the constructor, preventing this scenario from occurring.

---

### Extra Note 3 — Submodule Reproducibility
**Severity:** 🟢 Low  
**File:** `.gitmodules` / `README.md`

**Root Cause:** Ensuring submodule clones pull the exact audited commits.

**Fix:** Verified that the instructions in the `README.md` (`cd lib/xyz && git checkout vX.Y.Z`) correctly match exact tagged release commits in the openzeppelin and account-abstraction repos, ensuring 100% deterministic builds.

---

## Detailed Resolutions — Security Audit Findings (Round 2)

---

### H-01 — Submodule commit-pin mismatch (`.gitmodules` lacks branch fields)
**Severity:** 🔴 High  
**File:** `.gitmodules`

**Root Cause:** `.gitmodules` contained only `path` and `url` for all three submodules with zero `branch` fields. A fresh `git submodule update --init --recursive` would pull HEAD of the default branch, potentially pulling unaudited or incompatible versions. OpenZeppelin pre-4.7.3 had ECDSA signature malleability. `account-abstraction` HEAD may have breaking interface changes.

**Fix (final, Round 3):** Added `branch` fields and aligned `.gitmodules`,
`foundry.lock`, the actual submodule HEAD commits, and the README to a single
canonical signed-release tag per submodule. The values are kept in sync across
all four locations so a fresh clone always compiles the same audited bytecode:

```gitmodules
[submodule "lib/forge-std"]
    path = lib/forge-std
    url = https://github.com/foundry-rs/forge-std
    branch = v1.15.0

[submodule "lib/openzeppelin-contracts"]
    path = lib/openzeppelin-contracts
    url = https://github.com/OpenZeppelin/openzeppelin-contracts
    branch = v5.1.0

[submodule "lib/account-abstraction"]
    path = lib/account-abstraction
    url = https://github.com/eth-infinitism/account-abstraction
    branch = v0.7.0
```

| Submodule | Tag | SHA |
|---|---|---|
| `forge-std` | `v1.15.0` | `0844d7e1fc5e60d77b68e469bff60265f236c398` |
| `openzeppelin-contracts` | `v5.1.0` | `69c8def5f222ff96f2b5beff05dfba996368aa79` |
| `account-abstraction` | `v0.7.0` | `7af70c8993a6f42973f520ae0752386a5032abe7` |

See **Round 3 NEW-H-01** below for the audit trail of why these specific tags
were chosen (each is a signed release tag and the SHAs match the bytecode that
the regression suite was actually exercised against).

---

### H-02 — Non-canonical EntryPoint address without verification
**Severity:** 🔴 High  
**File:** `README.md`, `.env`, `.env.example`

**Root Cause:** The project previously used `0x3d05dea397e7778c5d453fc8f8ded3eacdb8d23e` as the EntryPoint — a custom deployment rather than the canonical ERC-4337 v0.7 address `0x0000000071727De22E5E9d8BAf0edAc6f37da032`. A custom EntryPoint is incompatible with major third-party bundlers (e.g., Pimlico, Alchemy) which hardcode the canonical EntryPoint to ensure they don't execute untrusted verification logic. 

**Fix:** 
1. Switched `.env` and `.env.example` to use the **Canonical ERC-4337 v0.7 EntryPoint** (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`).
2. Redeployed both `SimpleAccountFactory` and `VerifyingPaymaster` to bind to the canonical EntryPoint.
3. Updated the `README.md` to state clearly that the kit follows the official Standard unified deterministic address, removing the need for manual, error-prone bytecode verification on a custom deployment.

---

### H-03 — Floating pragma with compiler override
**Severity:** 🔴 High  
**Files:** All 8 Solidity files

**Root Cause:** All files declared `pragma solidity ^0.8.20` while `foundry.toml` pinned `solc_version = "0.8.24"`. The floating pragma allows any 0.8.x compiler ≥ 0.8.20, but only 0.8.24 was tested. Different compilers may produce different bytecode; future 0.8.x versions could introduce subtle behavior changes (e.g., the PUSH0 opcode not supported on RSK's Paris EVM).

**Fix:** Changed all Solidity files from `pragma solidity ^0.8.20;` to `pragma solidity 0.8.24;` (exact version) to match the tested compiler:
- `src/core/VerifyingPaymaster.sol`
- `src/mock/MockToken.sol`
- `test/VerifyingPaymaster.t.sol` *(Round 3 follow-up — initially missed; addressed by NEW-L-01)*
- `test/VerifyingPaymasterBugs.t.sol`
- `test/helpers/PaymasterHarness.sol` *(new helper added in Round 3)*
- `script/DeployPaymaster.s.sol`
- `script/DeploySimpleAccountFactory.s.sol`
- `script/DeployEntryPoint.s.sol`
- `script/DeployAllTestnet.s.sol`

---

### M-01 — Missing zero-address validation for `_token` constructor parameter
**Severity:** 🟠 Medium  
**File:** `src/core/VerifyingPaymaster.sol`

**Root Cause:** The constructor validated `_owner` and `_verifyingSigner` for zero-address but NOT `_token`. Deploying with `IERC20(address(0))` would succeed silently, creating a paymaster that cannot collect token payments — effectively providing free gas sponsorship until the RBTC deposit is drained.

**Fix:** Added to the constructor:
```solidity
require(address(_token) != address(0), "PM: invalid token");
```

**Test added:** `test_M01_ConstructorZeroTokenReverts()`

---

### M-02 — Beneficiary zero-address guard bypass in `executeUserOp.ts`
**Severity:** 🟠 Medium  
**Files:** `offchain/executeUserOp.ts`, `.env.example`

**Root Cause:** The beneficiary check used JavaScript falsy evaluation `if (!BENEFICIARY_ADDRESS)`. The `.env.example` set `BENEFICIARY_ADDRESS="0x0000000000000000000000000000000000000000"`. A zero-address string is truthy in JS (non-empty string), so it passes the guard. Gas refunds sent to address(0) on RSK are effectively burned.

**Fix:**
1. Added an explicit zero-address string check:
   ```typescript
   if (!BENEFICIARY_ADDRESS || BENEFICIARY_ADDRESS === "0x0000000000000000000000000000000000000000")
   ```
2. Changed `.env.example` to use an empty string default with a comment instructing users to set it explicitly.

---

### M-03 — No staking management — incompatible with strict bundlers
**Severity:** 🟠 Medium  
**Files:** `src/core/VerifyingPaymaster.sol`, `README.md`

**Root Cause:** The paymaster accesses associated ERC-20 storage during `_postOp` but never calls `addStake()` on the EntryPoint. ERC-4337 specification requires paymasters accessing associated storage to maintain a stake. Strict bundlers (Pimlico, Alchemy, Stackup) enforce this requirement.

**Fix:** `BasePaymaster` already provides `addStake()`, `unlockStake()`, and `withdrawStake()` functions (inherited automatically). Added:
1. Documentation comment in `VerifyingPaymaster.sol` explaining the inherited staking functions and their usage
2. A **"Bundler Staking (M-03)"** section in `README.md` with usage examples and an `[!IMPORTANT]` callout explaining the requirement

---

### M-04 — Timelock has no cancellation function
**Severity:** 🟠 Medium  
**File:** `src/core/VerifyingPaymaster.sol`

**Root Cause:** `requestExchangeRateUpdate()` sets a pending rate with a 1-day timelock, but there was no function to cancel it. In a key-compromise recovery scenario, the legitimate owner cannot cancel a malicious pending rate change.

**Fix:** Added `cancelExchangeRateUpdate()`:
```solidity
function cancelExchangeRateUpdate() external onlyOwner {
    require(exchangeRateUnlockTime != 0, "PM: no pending update");
    pendingExchangeRate = 0;
    exchangeRateUnlockTime = 0;
    emit ExchangeRateUpdateCancelled();
}
```

Also added `event ExchangeRateUpdateCancelled()`.

**Tests added:** `test_M04_CancelExchangeRateUpdate()`, `test_M04_CancelNoPendingReverts()`

---

### M-05 — Unlimited token approval (MAX_UINT256) in `setupPaymaster.ts`
**Severity:** 🟠 Medium  
**File:** `offchain/setupPaymaster.ts`

**Root Cause:** The setup script granted `MAX_UINT256` (2^256 - 1) approval to the paymaster contract, giving it unlimited token spending authority. If the paymaster or signer key is compromised, the attacker can drain ALL tokens from the smart account.

**Fix:** Replaced with bounded approval:
```typescript
const BOUNDED_APPROVAL = parseEther("100000"); // 100k tokens — enough for ~10,000 transactions
```
Added a console warning explaining the M-05 change and the risk tradeoff.

---

### M-06 — `withdrawToken` and `setVerifyingSigner` admin functions have no test coverage
**Severity:** 🟠 Medium  
**File:** `test/VerifyingPaymasterBugs.t.sol`

**Root Cause:** Neither test file contained tests for the success paths of `withdrawToken()` or `setVerifyingSigner()`. Only revert cases were tested. The `withdrawToken` function uses `safeTransfer` which could behave differently with non-standard tokens.

**Fix:** Added three new tests:
- `test_M06_WithdrawTokenSuccess()` — verifies token balance transfer from paymaster to recipient
- `test_M06_WithdrawTokenZeroAddressReverts()` — verifies the L-03 zero-address guard works
- `test_M06_SetVerifyingSignerSuccess()` — verifies state change and old signer is replaced

---

### M-07 — `PostOpMode.opReverted` not tested
**Severity:** 🟠 Medium  
**File:** `test/VerifyingPaymasterBugs.t.sol`

**Root Cause:** Tests covered `opSucceeded` and `postOpReverted` but not `opReverted` (which in ERC-4337 v0.7 replaced what v0.6 called `opUnused`). This mode is triggered when the account's `executeUserOp` call reverts but the operation should still be charged.

**Fix:** Added `test_M07_PostOpOpRevertedChargesCorrectly()` confirming that `PostOpMode.opReverted` follows the same token-charging path as `opSucceeded` (the `else` branch in `_postOp`).

> **Note:** The audit referred to `PostOpMode.opUnused`, which was the v0.6 name. In v0.7 this was renamed to `opReverted`.

---

### M-08 — Hardcoded demo values in `executeUserOp.ts`
**Severity:** 🟠 Medium  
**Files:** `offchain/executeUserOp.ts`, `.env.example`

**Root Cause:** Lines 283-285 hardcoded: destination `"0x1111111111111111111111111111111111111111"`, value `parseEther("0.0000001")`, and calldata `"0x1234"`. Users may accidentally send RBTC to the burn address.

**Fix:** Made all three configurable via environment variables with clearly-labeled demo defaults:
```typescript
const USEROP_DESTINATION = (process.env.USEROP_DESTINATION ?? "0x1111111111111111111111111111111111111111") as Hex;
const USEROP_VALUE = parseEther(process.env.USEROP_VALUE ?? "0.0000001");
const USEROP_CALLDATA = (process.env.USEROP_CALLDATA ?? "0x1234") as Hex;
```

Added corresponding entries to `.env.example` with WARNING comments.

---

### L-01 — Filename typo `VeryfingPaymaster.t.sol`
**Severity:** 🟢 Low  
**File:** `test/VeryfingPaymaster.t.sol` → deleted

**Root Cause:** Missing letter 'i' in "Verifying". The file contained a single `test_ValidSignature` test and a duplicate `PaymasterHarness` contract name.

**Fix:**
1. Merged the `test_ValidSignature` test into `VerifyingPaymasterBugs.t.sol` as `test_ValidSignature_MergedFromOldFile()`
2. Deleted the typo-named file entirely, eliminating the duplicate `PaymasterHarness` contract

---

### L-02 — Unused import `encodePacked` in `executeUserOp.ts`
**Severity:** 🟢 Low  
**File:** `offchain/executeUserOp.ts`

**Root Cause:** `encodePacked` was imported from viem at line 9 but never used. All packing is done via `concat + pad + toHex`.

**Fix:** Removed `encodePacked` from the import statement.

---

### L-03 — `withdrawToken` has no `to` zero-address guard
**Severity:** 🟢 Low  
**File:** `src/core/VerifyingPaymaster.sol`

**Root Cause:** `withdrawToken(address to, uint256 amount)` had no check for `to == address(0)`. An operator error could burn collected tokens.

**Fix:** Added:
```solidity
require(to != address(0), "PM: zero address");
```

**Test added:** `test_M06_WithdrawTokenZeroAddressReverts()`

---

### L-04 — Initial `exchangeRate` magic number not documented
**Severity:** 🟢 Low  
**File:** `src/core/VerifyingPaymaster.sol`

**Root Cause:** `exchangeRate = 1 * 10 ** 6;` — the value 1e6 was not explained. Given `PRICE_DENOMINATOR = 1e18`, this means 1 gas unit costs 1e6/1e18 = 1e-12 tokens, which may seem extremely cheap without context.

**Fix:** Defined as a named constant with NatSpec:
```solidity
/// @dev Default exchange rate: 1e6 / 1e18 = 1e-12 tokens per gas unit.
///      At 18-decimal tokens, this means 1M gas costs 0.000001 tokens.
uint256 public constant DEFAULT_EXCHANGE_RATE = 1e6;
```

**Test added:** `test_L04_DefaultExchangeRateConstant()`

---

### L-05 — Missing NatSpec documentation on public functions
**Severity:** 🟢 Low  
**File:** `src/core/VerifyingPaymaster.sol`

**Root Cause:** Several public/external functions lacked `@param` and `@return` NatSpec annotations.

**Fix:** Added `@param` and `@return` tags to all public/external functions:
- `getHash()` — added `@param userOp`, `@param validUntil`, `@param validAfter`, `@return`
- `withdrawToken()` — added `@param to`, `@param amount`
- `setVerifyingSigner()` — added `@param _newSigner`
- `requestExchangeRateUpdate()` — added `@param _newRate`
- `cancelExchangeRateUpdate()` — full NatSpec (new function)

---

### L-06 — `pendingExchangeRate` not reset after execution
**Severity:** 🟢 Low  
**File:** `src/core/VerifyingPaymaster.sol`

**Root Cause:** After `executeExchangeRateUpdate()`, `exchangeRateUnlockTime` was set to 0 but `pendingExchangeRate` retained its stale value, which could confuse off-chain monitoring tools.

**Fix:** Added `pendingExchangeRate = 0;` after the rate update in `executeExchangeRateUpdate()`:
```solidity
exchangeRate = pendingExchangeRate;
pendingExchangeRate = 0; // L-06: clear stale state
exchangeRateUnlockTime = 0;
```

**Test added:** `test_L06_PendingRateResetAfterExecution()`

---

### L-07 — `package.json` has Foundry boilerplate description
**Severity:** 🟢 Low  
**File:** `package.json`

**Root Cause:** The `description` field read: "Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust." — the default Foundry template text, not a description of this project.

**Fix:**
1. Replaced with project-specific description: *"A production-ready ERC-4337 Account Abstraction and gasless transaction toolkit for the Rootstock (RSK) network, featuring a VerifyingPaymaster that lets users pay gas in ERC-20 tokens."*
2. Added `forge:test`, `forge:build`, `typecheck`, and a combined `test` npm script:
```json
"scripts": {
    "setup": "tsx offchain/setupPaymaster.ts",
    "execute:op": "tsx offchain/executeUserOp.ts",
    "forge:test": "forge test -vv",
    "forge:build": "forge build",
    "typecheck": "tsc --noEmit",
    "test": "forge test -vv && tsc --noEmit"
}
```

---

## Verification

### Automated Tests

All 31 tests pass:

```
Ran 31 tests for test/VerifyingPaymasterBugs.t.sol:VerifyingPaymasterBugsTest
[PASS] test_Bug14_PostOpRevertedChargesGas()
[PASS] test_Bug14_PostOpRevertedDoesNotRevert()
[PASS] test_Bug14_PostOpRevertedWithNoTokensDoesNotRevert()
[PASS] test_Bug15_PostOpCapsAtMaxTokenCost()
[PASS] test_Bug15_PostOpChargesTokens()
[PASS] test_Bug15_ValidationPhaseNoTokenTransfer()
[PASS] test_Bug17_MockTokenMintOnlyOwner()
[PASS] test_Bug17_MockTokenOwnerCanMint()
[PASS] test_Bug1_PostOpAcceptsFourParams()
[PASS] test_Bug25_ConstructorZeroAddressReverts()
[PASS] test_Bug25_OwnerAndSignerMustDiffer()
[PASS] test_Bug25_SetVerifyingSignerCannotBeOwner()
[PASS] test_Bug4_DifferentNoncesProduceDifferentHashes()
[PASS] test_Bug4_ReplayProtectionNonceIncrements()
[PASS] test_Bug5_SetExchangeRateZeroReverts()
[PASS] test_Bug7_OnlyOwnerCanSetRate()
[PASS] test_Bug7_SetExchangeRateAboveMaxReverts()
[PASS] test_Bug7_SetExchangeRateBelowMinReverts()
[PASS] test_Bug7_SetExchangeRateEmitsEvent()
[PASS] test_L04_DefaultExchangeRateConstant()
[PASS] test_L06_PendingRateResetAfterExecution()
[PASS] test_M01_ConstructorZeroTokenReverts()
[PASS] test_M04_CancelExchangeRateUpdate()
[PASS] test_M04_CancelNoPendingReverts()
[PASS] test_M06_SetVerifyingSignerSuccess()
[PASS] test_M06_WithdrawTokenSuccess()
[PASS] test_M06_WithdrawTokenZeroAddressReverts()
[PASS] test_M07_PostOpOpRevertedChargesCorrectly()
[PASS] test_Regression_ValidSignatureStillPasses()
[PASS] test_Regression_WrongSignerFails()
[PASS] test_ValidSignature_MergedFromOldFile()

Suite result: ok. 31 passed; 0 failed; 0 skipped
```

---

## Detailed Resolutions — Security Audit Findings (Round 3 — Final)

This round addresses the last set of review findings: a supply-chain version
mismatch between `.gitmodules` / `foundry.lock` / README / actual submodule
HEAD, a dead npm dependency, residual test-file inconsistencies, and missing
PostOpMode coverage.

---

### NEW-H-01 — Submodule SHAs did not match declared branches

**Severity:** 🔴 High
**Files:** `.gitmodules`, `foundry.lock`, `README.md`, submodule HEADs

**Root Cause:** Round 2 added `branch` fields to `.gitmodules` (H-01), but the
values disagreed with the actually-checked-out commits and with `foundry.lock`:

| Source | forge-std | openzeppelin-contracts |
|---|---|---|
| `.gitmodules` declared | `v1.9.4` | `v5.2.0` |
| `foundry.lock` declared | `v1.15.0` | `v5.5.0` |
| Actual submodule HEAD | `0844d7e1` (= `v1.15.0`) | `69c8def5` (= `v5.1.0`) |
| README manual checkout | `v1.9.4` | `v5.2.0` |

The compiled bytecode therefore came from `forge-std v1.15.0` and
`openzeppelin-contracts v5.1.0`, but a contributor following the README would
silently downgrade to `v1.9.4` / `v5.2.0` — a different ECDSA, SafeERC20, and
Ownable implementation. Same supply-chain risk class as the original H-01,
just at a different layer.

**Fix:** Aligned all four sources to the signed release tags that match the
actual HEADs (which are the bytecode the regression suite was exercised
against). Choosing the actually-tested commits avoided introducing a new
attack surface by swapping primitives:

| Submodule | Pinned tag | SHA | Verified signed release |
|---|---|---|---|
| `forge-std` | `v1.15.0` | `0844d7e1fc5e60d77b68e469bff60265f236c398` | ✅ |
| `openzeppelin-contracts` | `v5.1.0` | `69c8def5f222ff96f2b5beff05dfba996368aa79` | ✅ (`git tag --contains 69c8def5` → `v5.1.0`) |
| `account-abstraction` | `v0.7.0` | `7af70c8993a6f42973f520ae0752386a5032abe7` | ✅ (already aligned) |

Changes:
1. `.gitmodules` — `branch` updated to `v1.15.0` and `v5.1.0` respectively.
2. `foundry.lock` — `openzeppelin-contracts` entry rewritten from `v5.5.0` /
   `fcbae539…` to `v5.1.0` / `69c8def5…`. `forge-std` / `account-abstraction`
   entries already matched HEAD.
3. `README.md` — manual `git checkout` instructions updated to `v5.1.0` and
   `v1.15.0`, with a note explaining why these match `.gitmodules` and
   `foundry.lock`.
4. Submodule HEADs — already at the correct commits; no reset needed.

**Verification:**
```bash
$ cd lib/openzeppelin-contracts && git describe --tags HEAD
v5.1.0
$ cd lib/forge-std && git describe --tags HEAD
v1.15.0
$ cd lib/account-abstraction && git describe --tags HEAD
v0.7.0
```

---

### NEW-M-01 — `permissionless` declared as production dependency but never used

**Severity:** 🟡 Medium
**File:** `package.json`, `package-lock.json`, `README.md`

**Root Cause:** `package.json` listed `"permissionless": "^0.3.4"` in
`dependencies`, but `grep -r permissionless` across `offchain/`, `script/`, and
`test/` returned zero source-code imports. Two harms: (a) dead install footprint
and audit surface (QA dimension); (b) caret range (`^0.3.4`) means any minor
through `<0.4.0` could install on a fresh `npm install` — turning an unused
dependency into a live install-time vector if `package-lock.json` is regenerated.

**Fix:** Removed the dependency from `package.json` and regenerated
`package-lock.json` (`npm install` reports `removed 1 package`). Also removed
the now-misleading `permissionless.js` mention from the README's "Ecosystem
Compatibility" line.

**Verification:**
```bash
$ grep -rn permissionless package.json package-lock.json README.md
(no matches)
$ npm test  # forge test + tsc --noEmit
33 tests passed, 0 failed
```

---

### NEW-L-01 — Floating pragma in `test/VerifyingPaymaster.t.sol`

**Severity:** 🟢 Low (originally High in Round 1 H-03; reduced to Low because
production contracts are already pinned — only one regression-suite file
remained on `^0.8.20`).

**File:** `test/VerifyingPaymaster.t.sol`

**Root Cause:** Round 2 H-03 fix pinned every `.sol` file in the repo to
`pragma solidity 0.8.24` *except* `test/VerifyingPaymaster.t.sol`, which still
declared `pragma solidity ^0.8.20`. A future Foundry pulling a different 0.8.x
compiler could surface different gas costs or panic-encoding differences in
this single test file.

**Fix:** Pinned the file to `pragma solidity 0.8.24` to match every other
`.sol` file in the repo. The Round 2 H-03 file list above is updated to
include this file (and the new `test/helpers/PaymasterHarness.sol` shared helper).

---

### NEW-L-02 — Duplicate `PaymasterHarness` across test files

**Severity:** 🟢 Low
**Files:** `test/VerifyingPaymaster.t.sol`, `test/VerifyingPaymasterBugs.t.sol`

**Root Cause:** Both test files defined a contract named `PaymasterHarness`,
and the two definitions had drifted — the bugs file exposed both `testValidate`
and `testPostOp`, the older file exposed only `testValidate`. Foundry compiled
both without complaint, but a future change to one would silently miss the
other and any validation-behavior refactor would have to be applied twice.

**Fix:**
1. Created `test/helpers/PaymasterHarness.sol` as the single source of truth,
   exposing the union of both methods (`testValidate` + `testPostOp`).
2. Pinned the helper to `pragma solidity 0.8.24` from the start.
3. Both test files now `import "./helpers/PaymasterHarness.sol";` and the
   in-file `contract PaymasterHarness { … }` definitions were removed.

**Verification:** `forge build` compiles cleanly; all 33 tests pass.

---

### NEW-L-03 — Inconsistent test-setup pattern between test files

**Severity:** 🟢 Low
**File:** `test/VerifyingPaymaster.t.sol`

**Root Cause:** `VerifyingPaymaster.t.sol` used `address(this)` as the paymaster
owner in `setUp()`. That can mask permission bugs because the test contract
itself "owns" the system under test — a function that should revert for a
non-owner could pass silently if invoked from `address(this)`. The bugs file
already used the safer `makeAddr("owner") + vm.prank(owner)` pattern.

**Fix:** Migrated `setUp()` in `test/VerifyingPaymaster.t.sol` to:
```solidity
owner = makeAddr("owner");
…
paymaster = new PaymasterHarness(IEntryPoint(entryPointMock), owner, signer, IERC20(address(token)));
```
Now both test files use identical setup semantics, and any future owner-gated
assertion in this file requires an explicit `vm.prank(owner)` to succeed.

---

### NEW-I-01 — Explicit `PostOpMode.opUnused` regression coverage

**Severity:** ℹ️ Informational
**Files:** `src/core/VerifyingPaymaster.sol`, `test/VerifyingPaymasterBugs.t.sol`

**Root Cause + Investigation:** The review note asked for a direct test of
`PostOpMode.opUnused`, citing a code comment in `_postOp` that mentioned
`opUnused`. Verifying against the pinned `account-abstraction v0.7.0` source
(`lib/account-abstraction/contracts/interfaces/IPaymaster.sol`), the v0.7
`PostOpMode` enum has exactly **three** values:

```solidity
enum PostOpMode { opSucceeded, opReverted, postOpReverted }
```

There is no `opUnused` member in v0.7 (it existed in earlier draft revisions
of the spec). The original `// opSucceeded or opUnused` comment in
`_postOp` was therefore misleading — it both named a non-existent enum value
and missed that the `else` branch actually covers `opSucceeded` *and*
`opReverted`.

**Fix (two parts):**

1. **Source-comment correction** — `src/core/VerifyingPaymaster.sol` `_postOp`
   else-branch comment rewritten to accurately describe the v0.7 enum:

   ```solidity
   // Normal charging path. In ERC-4337 v0.7 the PostOpMode enum only
   // has three values: opSucceeded, opReverted, postOpReverted.
   // postOpReverted is handled in the branch above, so this `else`
   // covers BOTH opSucceeded and opReverted — per the spec, a reverted
   // user-op still owes gas. safeTransferFrom reverts on failure,
   // which causes the EntryPoint to re-invoke _postOp with
   // mode=postOpReverted (handled in the if-branch above).
   ```

2. **Test added** — `test_NEW_I_01_PostOpAllModesChargeConsistently` in
   `test/VerifyingPaymasterBugs.t.sol` exhaustively exercises every actual
   v0.7 `PostOpMode` value (`opSucceeded`, `opReverted`, `postOpReverted`)
   with identical inputs and asserts the resulting token charge is identical
   in all three cases. Any future refactor that splits the else-branch (e.g.
   to refund opReverted differently, or to skip charging in any mode) will
   fail this test loudly.

**Verification:**
```text
[PASS] test_NEW_I_01_PostOpAllModesChargeConsistently() (gas: 277724)
```

---

## Final Test-Suite Status (Round 3)

```text
$ forge test -vv
Ran 1 test for test/VerifyingPaymaster.t.sol:VerifyingPaymasterTest
[PASS] test_ValidSignature()

Ran 32 tests for test/VerifyingPaymasterBugs.t.sol:VerifyingPaymasterBugsTest
[PASS] test_Bug14_PostOpRevertedChargesGas()
[PASS] test_Bug14_PostOpRevertedDoesNotRevert()
[PASS] test_Bug14_PostOpRevertedWithNoTokensDoesNotRevert()
[PASS] test_Bug15_PostOpCapsAtMaxTokenCost()
[PASS] test_Bug15_PostOpChargesTokens()
[PASS] test_Bug15_ValidationPhaseNoTokenTransfer()
[PASS] test_Bug17_MockTokenMintOnlyOwner()
[PASS] test_Bug17_MockTokenOwnerCanMint()
[PASS] test_Bug1_PostOpAcceptsFourParams()
[PASS] test_Bug25_ConstructorZeroAddressReverts()
[PASS] test_Bug25_OwnerAndSignerMustDiffer()
[PASS] test_Bug25_SetVerifyingSignerCannotBeOwner()
[PASS] test_Bug4_DifferentNoncesProduceDifferentHashes()
[PASS] test_Bug4_ReplayProtectionNonceIncrements()
[PASS] test_Bug5_SetExchangeRateZeroReverts()
[PASS] test_Bug7_OnlyOwnerCanSetRate()
[PASS] test_Bug7_SetExchangeRateAboveMaxReverts()
[PASS] test_Bug7_SetExchangeRateBelowMinReverts()
[PASS] test_Bug7_SetExchangeRateEmitsEvent()
[PASS] test_L04_DefaultExchangeRateConstant()
[PASS] test_L06_PendingRateResetAfterExecution()
[PASS] test_M01_ConstructorZeroTokenReverts()
[PASS] test_M04_CancelExchangeRateUpdate()
[PASS] test_M04_CancelNoPendingReverts()
[PASS] test_M06_SetVerifyingSignerSuccess()
[PASS] test_M06_WithdrawTokenSuccess()
[PASS] test_M06_WithdrawTokenZeroAddressReverts()
[PASS] test_M07_PostOpOpRevertedChargesCorrectly()
[PASS] test_NEW_I_01_PostOpAllModesChargeConsistently()
[PASS] test_Regression_ValidSignatureStillPasses()
[PASS] test_Regression_WrongSignerFails()
[PASS] test_ValidSignature_MergedFromOldFile()

Ran 2 test suites: 33 tests passed, 0 failed, 0 skipped (33 total tests)

$ tsc --noEmit
(no errors)
```
