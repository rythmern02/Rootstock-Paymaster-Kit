# Bug Resolution Report — Rootstock ERC-4337 Verifying Paymaster Kit

> All 26 bugs reported in the audit have been resolved. This document details each bug, its root cause, severity, the fix applied, and which files were changed.

---

## Summary Table

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

## Detailed Resolutions

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
- Added `uint256 public constant MAX_RATE = 1e30`
- Added `event ExchangeRateUpdated(uint256 indexed oldRate, uint256 indexed newRate)`
- `setExchangeRate()` now enforces bounds and emits the event.

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

**Fix:** `validUntil` and `validAfter` are kept as `bigint` throughout and passed directly to `encodeAbiParameters` (viem accepts both).

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

**Fix:** Added `BENEFICIARY_ADDRESS` env var. If set, it's used as beneficiary. Falls back to `coordinatorAccount.address` with a console warning so operators are aware.

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
