import "dotenv/config";
import {
  Hex,
  concat,
  keccak256,
  pad,
  toHex,
  encodeAbiParameters,
  parseAbiParameters,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const PAYMASTER_ADDRESS =
  (process.env.PAYMASTER_ADDRESS as Hex) ||
  ("0x17313EA008bA8FC7Ceb58D64C6cE549b723c0A0c" as Hex);
const SIGNER_PRIVATE_KEY =
  (process.env.PAYMASTER_SIGNER_KEY as Hex);

const VERIFICATION_GAS_LIMIT = 100_000n;
const POST_OP_GAS_LIMIT = 100_000n;

/**
 * v0.6 UserOperation shape passed to getPaymasterData
 */
type UserOpV06 = {
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

/**
 * Compute getHash (matches RootstockVerifyingPaymaster.getHash).
 * Uses paymasterAndData[20:52] (gas limits) - excludes signature to avoid circular dependency.
 */
function computeGetHash(
  userOp: UserOpV06,
  paymasterAndData: Hex,
  validUntil: bigint,
  validAfter: bigint,
  chainId: number,
  paymasterAddr: Hex
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

  const paymasterGasPart =
    paymasterAndData.length >= 106
      ? ("0x" + paymasterAndData.slice(42, 106).padStart(64, "0")) as Hex
      : "0x0000000000000000000000000000000000000000000000000000000000000000";
  const gasPartAsBigInt = BigInt(paymasterGasPart);

  return keccak256(
    encodeAbiParameters(
      parseAbiParameters(
        "address sender, uint256 nonce, bytes32 hashInitCode, bytes32 hashCallData, bytes32 accountGasLimits, uint256 paymasterGasPart, uint256 preVerificationGas, bytes32 gasFees, uint256 chainId, address paymaster, uint48 validUntil, uint48 validAfter"
      ),
      [
        userOp.sender,
        nonce,
        keccak256(initCode as `0x${string}`),
        keccak256(callData as `0x${string}`),
        accountGasLimits as `0x${string}`,
        gasPartAsBigInt,
        preVerificationGas,
        gasFees as `0x${string}`,
        BigInt(chainId),
        paymasterAddr,
        Number(validUntil),
        Number(validAfter),
      ]
    )
  ) as Hex;
}

/**
 * Build paymasterAndData for RootstockVerifyingPaymaster.
 * Layout: [paymaster(20)] [verificationGasLimit(16)] [postOpGasLimit(16)] [validUntil(6)] [validAfter(6)] [signature(65)]
 */
export async function getPaymasterSignature(
  userOp: UserOpV06,
  paymasterAndDataStub: Hex,
  chainId: number
): Promise<Hex> {
  const account = privateKeyToAccount(SIGNER_PRIVATE_KEY);
  const validAfter = 0n;
  const validUntil = BigInt(Math.floor(Date.now() / 1000) + 300);

  const messageHash = computeGetHash(
    userOp,
    paymasterAndDataStub,
    validUntil,
    validAfter,
    chainId,
    PAYMASTER_ADDRESS
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

/**
 * Stub paymasterAndData for gas estimation - same layout, zero signature (65 bytes).
 */
export function getPaymasterStubData(): Hex {
  const validAfter = 0n;
  const validUntil = BigInt(Math.floor(Date.now() / 1000) + 300);
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
