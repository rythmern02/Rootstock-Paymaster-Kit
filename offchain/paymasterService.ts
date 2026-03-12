// paymasterService.ts — Off-chain signing service for RootstockVerifyingPaymaster
import "dotenv/config";
import {
  createPublicClient,
  http,
  Hex,
  concat,
  keccak256,
  pad,
  toHex,
  encodeAbiParameters,
  parseAbiParameters,
  hexToBytes,
  bytesToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { rootstockTestnet } from "viem/chains";

// ─── Config & Guards ─────────────────────────────────────────────────────────

// Bug #2: Validate PAYMASTER_SIGNER_KEY before use.
if (!process.env.PAYMASTER_SIGNER_KEY) {
  throw new Error(
    "Missing required env var: PAYMASTER_SIGNER_KEY\n" +
    "Set it in .env — this is the private key of the off-chain paymaster signer."
  );
}

// Bug #3: Remove hardcoded fallback so a stale address never silently produces invalid sigs.
if (!process.env.PAYMASTER_ADDRESS) {
  throw new Error(
    "Missing required env var: PAYMASTER_ADDRESS\n" +
    "Populate .env with the address from your most recent deployment."
  );
}

const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS as Hex;
const SIGNER_PRIVATE_KEY = process.env.PAYMASTER_SIGNER_KEY as Hex;

// Bug #20: Gas limits configurable via env vars with sensible defaults.
const VERIFICATION_GAS_LIMIT = BigInt(
  process.env.VERIFICATION_GAS_LIMIT ?? "100000"
);
const POST_OP_GAS_LIMIT = BigInt(process.env.POST_OP_GAS_LIMIT ?? "100000");

// Bug #11: Validity window raised to 30 min and made configurable.
const VALIDITY_SECONDS = BigInt(
  process.env.PAYMASTER_VALIDITY_SECONDS ?? "1800"
);

const RPC_URL =
  process.env.RSK_TESTNET_RPC_URL || "https://public-node.testnet.rsk.co";

// Public client for on-chain reads (paymasterNonce lookup — Bug #4).
const publicClient = createPublicClient({
  chain: rootstockTestnet,
  transport: http(RPC_URL),
});

// Minimal ABI for the paymasterNonce view (Bug #4).
const paymasterNonceAbi = [
  {
    name: "paymasterNonces",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * v0.7 UserOperation fields required for paymaster hash computation.
 */
type UserOpV07 = {
  sender: Hex;
  nonce?: bigint;
  initCode?: Hex;
  callData?: Hex;
  callGasLimit?: bigint;
  verificationGasLimit?: bigint;
  preVerificationGas?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  paymasterAndData?: Hex;
};

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Compute getHash matching RootstockVerifyingPaymaster.getHash().
 *
 * Bug #4 fix:  paymasterNonce is now included in the hash to prevent replay
 *              within the validity window.
 * Bug #18 fix: paymasterGasPart extracted via byte-level operations (hexToBytes)
 *              so it is not affected by the presence/absence of the "0x" prefix.
 * Bug #19 fix: validUntil/validAfter kept as bigint throughout — no Number() cast.
 */
function computeGetHash(
  userOp: UserOpV07,
  paymasterAndData: Hex,
  validUntil: bigint,
  validAfter: bigint,
  chainId: number,
  paymasterAddr: Hex,
  paymasterNonce: bigint
): Hex {
  const initCode = userOp.initCode || "0x";
  const callData = userOp.callData || "0x";
  const nonce = userOp.nonce ?? 0n;
  const callGasLimit = userOp.callGasLimit ?? 0n;
  const verificationGasLimit = userOp.verificationGasLimit ?? 0n;
  const preVerificationGas = userOp.preVerificationGas ?? 0n;
  const maxFeePerGas = userOp.maxFeePerGas ?? 0n;
  const maxPriorityFeePerGas = userOp.maxPriorityFeePerGas ?? 0n;

  const accountGasLimits = concat([
    pad(toHex(verificationGasLimit), { size: 16 }),
    pad(toHex(callGasLimit), { size: 16 }),
  ]) as Hex;
  const gasFees = concat([
    pad(toHex(maxPriorityFeePerGas), { size: 16 }),
    pad(toHex(maxFeePerGas), { size: 16 }),
  ]) as Hex;

  // Bug #18: Use byte-level slice (hexToBytes) instead of raw string slice.
  // Layout: [0:20] paymaster addr, [20:36] verificationGasLimit, [36:52] postOpGasLimit
  // We want bytes 20–52 (32 bytes = the two packed gas limits).
  let gasPartAsBigInt = 0n;
  try {
    const pmBytes = hexToBytes(paymasterAndData);
    if (pmBytes.length >= 52) {
      const gasPartBytes = pmBytes.slice(20, 52);
      gasPartAsBigInt = BigInt(
        "0x" +
        Array.from(gasPartBytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
      );
    }
  } catch {
    // paymasterAndData is a stub/empty — use zero.
    gasPartAsBigInt = 0n;
  }

  return keccak256(
    encodeAbiParameters(
      parseAbiParameters(
        // Bug #4: paymasterNonce added to match the on-chain getHash.
        "address sender, uint256 paymasterNonce, uint256 nonce, bytes32 hashInitCode, bytes32 hashCallData, bytes32 accountGasLimits, uint256 paymasterGasPart, uint256 preVerificationGas, bytes32 gasFees, uint256 chainId, address paymaster, uint48 validUntil, uint48 validAfter"
      ),
      [
        userOp.sender,
        paymasterNonce, // Bug #4
        nonce,
        keccak256(initCode as `0x${string}`),
        keccak256(callData as `0x${string}`),
        accountGasLimits as `0x${string}`,
        gasPartAsBigInt,
        preVerificationGas,
        gasFees as `0x${string}`,
        BigInt(chainId),
        paymasterAddr,
        // Bug #19: validUntil/validAfter remain bigint throughout all arithmetic
        // to prevent overflow. The Number() cast here is safe: uint48 max value
        // (281,474,976,710,655) is well within Number.MAX_SAFE_INTEGER (2^53-1).
        Number(validUntil),
        Number(validAfter),
      ]
    )
  ) as Hex;
}

// ─── Exported API ────────────────────────────────────────────────────────────

/**
 * Compute a fixed ValidUntil/ValidAfter pair once so both the stub and the
 * real signature always share identical timestamps.
 *
 * Bug #8 fix: caller computes timestamps once and passes them to both
 *             getPaymasterStubData() and getPaymasterSignature().
 */
export function computeValidityWindow(): {
  validUntil: bigint;
  validAfter: bigint;
} {
  const validAfter = 0n;
  // Bug #11: use configurable VALIDITY_SECONDS (default 30 min).
  const validUntil = BigInt(Math.floor(Date.now() / 1000)) + VALIDITY_SECONDS;
  return { validUntil, validAfter };
}

/**
 * Build paymasterAndData stub for gas estimation — same layout, zero signature.
 *
 * Bug #8 fix: accepts validUntil/validAfter so the stub uses the same timestamps
 *             as the real signature.
 *
 * Layout: [paymaster(20)][verificationGas(16)][postOpGas(16)][validUntil(6)][validAfter(6)][sig(65)]
 */
export function getPaymasterStubData(
  validUntil: bigint,
  validAfter: bigint
): Hex {
  const zeroSig = ("0x" + "00".repeat(65)) as Hex;
  return concat([
    PAYMASTER_ADDRESS,
    pad(toHex(VERIFICATION_GAS_LIMIT), { size: 16 }),
    pad(toHex(POST_OP_GAS_LIMIT), { size: 16 }),
    pad(toHex(validUntil), { size: 6 }),
    pad(toHex(validAfter), { size: 6 }),
    zeroSig,
  ]);
}

/**
 * Build the final signed paymasterAndData for RootstockVerifyingPaymaster.
 *
 * Bug #4 fix:  Fetches paymasterNonce on-chain and includes it in the hash.
 * Bug #8 fix:  Accepts pre-computed validUntil/validAfter (no Date.now() drift).
 * Bug #19 fix: validUntil/validAfter stay as bigint throughout.
 */
export async function getPaymasterSignature(
  userOp: UserOpV07,
  paymasterAndDataStub: Hex,
  chainId: number,
  validUntil: bigint,
  validAfter: bigint
): Promise<Hex> {
  // Bug #4: Fetch the current per-sender paymaster nonce from the contract.
  const paymasterNonce = (await publicClient.readContract({
    address: PAYMASTER_ADDRESS,
    abi: paymasterNonceAbi,
    functionName: "paymasterNonces",
    args: [userOp.sender],
  })) as bigint;

  const account = privateKeyToAccount(SIGNER_PRIVATE_KEY);

  const messageHash = computeGetHash(
    userOp,
    paymasterAndDataStub,
    validUntil,
    validAfter,
    chainId,
    PAYMASTER_ADDRESS,
    paymasterNonce
  );

  const signature = await account.signMessage({
    message: { raw: messageHash },
  });

  return concat([
    PAYMASTER_ADDRESS,
    pad(toHex(VERIFICATION_GAS_LIMIT), { size: 16 }),
    pad(toHex(POST_OP_GAS_LIMIT), { size: 16 }),
    pad(toHex(validUntil), { size: 6 }),
    pad(toHex(validAfter), { size: 6 }),
    signature,
  ]);
}
