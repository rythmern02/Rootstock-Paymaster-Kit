// executeUserOp.ts — Build & submit a UserOp via direct handleOps on RSK Testnet
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  encodeFunctionData,
  encodePacked,
  concat,
  pad,
  toHex,
  formatEther,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { rootstockTestnet } from "viem/chains";
import {
  getPaymasterSignature,
  getPaymasterStubData,
  computeValidityWindow,
} from "./paymasterService";

// ─── Config & Guards ─────────────────────────────────────────────────────────

// Bug #20: Gas limits configurable via env vars with RSK-friendly defaults.
const RPC_URL =
  process.env.RSK_TESTNET_RPC_URL || "https://public-node.testnet.rsk.co";
const ENTRY_POINT_ADDRESS = process.env.ENTRY_POINT_ADDRESS as Hex;
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS as Hex;
const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS as Hex;
const USER_PRIVATE_KEY = process.env.USER_PRIVATE_KEY as Hex;
const COORDINATOR_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY as Hex;

// Bug #23: Beneficiary is configurable. Defaults to coordinator but warns.
const BENEFICIARY_ADDRESS = process.env.BENEFICIARY_ADDRESS as Hex | undefined;

// Bug #20: Gas limit env overrides.
const VERIFY_GAS_DEPLOYED = BigInt(process.env.OP_VERIFY_GAS_DEPLOYED ?? "200000");
const VERIFY_GAS_NEW = BigInt(process.env.OP_VERIFY_GAS_NEW ?? "500000");
const CALL_GAS_LIMIT = BigInt(process.env.OP_CALL_GAS_LIMIT ?? "200000");
const PRE_VERIFY_GAS_DEPLOYED = BigInt(process.env.OP_PRE_VERIFY_GAS_DEPLOYED ?? "60000");
const PRE_VERIFY_GAS_NEW = BigInt(process.env.OP_PRE_VERIFY_GAS_NEW ?? "100000");
const HANDLE_OPS_GAS = BigInt(process.env.HANDLE_OPS_GAS ?? "2000000");

if (
  !ENTRY_POINT_ADDRESS ||
  !FACTORY_ADDRESS ||
  !PAYMASTER_ADDRESS ||
  !USER_PRIVATE_KEY ||
  !COORDINATOR_PRIVATE_KEY
) {
  throw new Error(
    "Missing required .env vars: ENTRY_POINT_ADDRESS, FACTORY_ADDRESS, " +
    "PAYMASTER_ADDRESS, USER_PRIVATE_KEY, WALLET_PRIVATE_KEY"
  );
}

// ─── Clients ─────────────────────────────────────────────────────────────────

const publicClient = createPublicClient({
  chain: rootstockTestnet,
  transport: http(RPC_URL),
});

const ownerAccount = privateKeyToAccount(USER_PRIVATE_KEY);
const coordinatorAccount = privateKeyToAccount(COORDINATOR_PRIVATE_KEY);

const walletClient = createWalletClient({
  account: coordinatorAccount,
  chain: rootstockTestnet,
  transport: http(RPC_URL),
});

// ─── ABIs ────────────────────────────────────────────────────────────────────

const entryPointAbi = [
  {
    name: "handleOps",
    type: "function",
    inputs: [
      {
        name: "ops",
        type: "tuple[]",
        components: [
          { name: "sender", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "initCode", type: "bytes" },
          { name: "callData", type: "bytes" },
          { name: "accountGasLimits", type: "bytes32" },
          { name: "preVerificationGas", type: "uint256" },
          { name: "gasFees", type: "bytes32" },
          { name: "paymasterAndData", type: "bytes" },
          { name: "signature", type: "bytes" },
        ],
      },
      { name: "beneficiary", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "getNonce",
    type: "function",
    inputs: [
      { name: "sender", type: "address" },
      { name: "key", type: "uint192" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "getUserOpHash",
    type: "function",
    inputs: [
      {
        type: "tuple",
        components: [
          { name: "sender", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "initCode", type: "bytes" },
          { name: "callData", type: "bytes" },
          { name: "accountGasLimits", type: "bytes32" },
          { name: "preVerificationGas", type: "uint256" },
          { name: "gasFees", type: "bytes32" },
          { name: "paymasterAndData", type: "bytes" },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

const simpleAccountAbi = [
  {
    name: "execute",
    type: "function",
    inputs: [
      { name: "dest", type: "address" },
      { name: "value", type: "uint256" },
      { name: "func", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

const factoryAbi = [
  {
    name: "getAddress",
    type: "function",
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "uint256" },
    ],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  {
    name: "createAccount",
    type: "function",
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "uint256" },
    ],
    outputs: [{ type: "address" }],
    stateMutability: "nonpayable",
  },
] as const;

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  ERC-4337 UserOp Execution on RSK Testnet");
  console.log("═══════════════════════════════════════════════════\n");

  // Bug #23: Warn if using default coordinator as beneficiary.
  const beneficiary: Hex = BENEFICIARY_ADDRESS ?? coordinatorAccount.address;
  if (!BENEFICIARY_ADDRESS) {
    console.warn(
      "⚠️  BENEFICIARY_ADDRESS not set — using coordinator address as beneficiary.\n" +
      "   Set BENEFICIARY_ADDRESS in .env for production deployments."
    );
  }

  // Step 1: Compute the Smart Account address.
  let smartAccountAddress: Hex;
  try {
    smartAccountAddress = (await publicClient.readContract({
      address: FACTORY_ADDRESS,
      abi: factoryAbi,
      functionName: "getAddress",
      args: [ownerAccount.address, 0n],
    })) as Hex;
  } catch (e: any) {
    throw new Error(`[Step 1 — getAddress] ${e.shortMessage ?? e.message}`);
  }

  console.log("Smart Account:  ", smartAccountAddress);
  console.log("Owner EOA:      ", ownerAccount.address);
  console.log("Coordinator EOA:", coordinatorAccount.address);
  console.log("Beneficiary:    ", beneficiary);

  // Step 2: Pre-flight checks.
  console.log("\n--- Pre-flight Checks ---");

  let isDeployed: boolean;
  try {
    const accountCode = await publicClient.getCode({ address: smartAccountAddress });
    isDeployed = accountCode !== undefined && accountCode !== "0x";
    console.log("Account deployed:", isDeployed);
  } catch (e: any) {
    throw new Error(`[Step 2 — getCode] ${e.shortMessage ?? e.message}`);
  }

  let paymasterDeposit: bigint;
  try {
    paymasterDeposit = (await publicClient.readContract({
      address: ENTRY_POINT_ADDRESS,
      abi: entryPointAbi,
      functionName: "balanceOf",
      args: [PAYMASTER_ADDRESS],
    })) as bigint;
    console.log("Paymaster deposit:", formatEther(paymasterDeposit), "RBTC");
    if (paymasterDeposit === 0n) {
      throw new Error(
        "❌ Paymaster has ZERO deposit in EntryPoint! Run:\n  npx tsx offchain/setupPaymaster.ts"
      );
    }
  } catch (e: any) {
    if (e.message?.includes("ZERO deposit")) throw e;
    throw new Error(`[Step 2 — balanceOf] ${e.shortMessage ?? e.message}`);
  }

  let nonce: bigint;
  try {
    nonce = (await publicClient.readContract({
      address: ENTRY_POINT_ADDRESS,
      abi: entryPointAbi,
      functionName: "getNonce",
      args: [smartAccountAddress, 0n],
    })) as bigint;
    console.log("Account nonce:  ", nonce.toString());
  } catch (e: any) {
    throw new Error(`[Step 2 — getNonce] ${e.shortMessage ?? e.message}`);
  }

  // Step 3: Build initCode (only if not deployed).
  let initCode: Hex = "0x";
  if (!isDeployed) {
    try {
      console.log("⚠️  Account not deployed — building initCode...");
      const createAccountCalldata = encodeFunctionData({
        abi: factoryAbi,
        functionName: "createAccount",
        args: [ownerAccount.address, 0n],
      });
      initCode = concat([FACTORY_ADDRESS, createAccountCalldata]);
      console.log("initCode built (length):", initCode.length);
    } catch (e: any) {
      throw new Error(`[Step 3 — initCode] ${e.shortMessage ?? e.message}`);
    }
  }

  // Step 4: Build callData.
  let executeCallData: Hex;
  try {
    executeCallData = encodeFunctionData({
      abi: simpleAccountAbi,
      functionName: "execute",
      args: [
        "0x1111111111111111111111111111111111111111",
        parseEther("0.0000001"),
        "0x1234" as Hex,
      ],
    });
  } catch (e: any) {
    throw new Error(`[Step 4 — callData] ${e.shortMessage ?? e.message}`);
  }

  // Step 5: Get gas price.
  let gasPrice: bigint;
  try {
    gasPrice = await publicClient.getGasPrice();
    console.log("Current gas price:", gasPrice.toString(), "wei");
  } catch (e: any) {
    throw new Error(`[Step 5 — getGasPrice] ${e.shortMessage ?? e.message}`);
  }

  // Bug #20: Use env-configurable gas limits.
  const verificationGasLimit = isDeployed ? VERIFY_GAS_DEPLOYED : VERIFY_GAS_NEW;
  const callGasLimit = CALL_GAS_LIMIT;
  const preVerificationGas = isDeployed ? PRE_VERIFY_GAS_DEPLOYED : PRE_VERIFY_GAS_NEW;

  const accountGasLimits = concat([
    pad(toHex(verificationGasLimit), { size: 16 }),
    pad(toHex(callGasLimit), { size: 16 }),
  ]);
  const gasFees = concat([
    pad(toHex(gasPrice), { size: 16 }),
    pad(toHex(gasPrice), { size: 16 }),
  ]);

  // Step 6: Build base UserOp.
  let userOp = {
    sender: smartAccountAddress,
    nonce,
    initCode,
    callData: executeCallData,
    accountGasLimits: accountGasLimits as Hex,
    preVerificationGas,
    gasFees: gasFees as Hex,
    paymasterAndData: "0x" as Hex,
    signature: "0x" as Hex,
  };

  // Step 7: Attach paymaster data.
  // Bug #8: Compute validity window ONCE and pass to both stub & signature.
  const { validUntil, validAfter } = computeValidityWindow();

  const stub = getPaymasterStubData(validUntil, validAfter);

  const userOpForPaymaster = {
    sender: smartAccountAddress,
    nonce,
    initCode,
    callData: executeCallData,
    callGasLimit,
    verificationGasLimit,
    preVerificationGas,
    maxFeePerGas: gasPrice,
    maxPriorityFeePerGas: gasPrice,
    paymasterAndData: stub,
  };

  try {
    userOp.paymasterAndData = await getPaymasterSignature(
      userOpForPaymaster,
      stub,
      rootstockTestnet.id, // chainId 31
      validUntil,
      validAfter
    );
    console.log("\nPaymaster data attached (length):", userOp.paymasterAndData.length);
  } catch (e: any) {
    throw new Error(
      `[Step 7 — getPaymasterSignature] Failed to sign UserOp: ${e.shortMessage ?? e.message}`
    );
  }

  // Step 8: Sign the UserOp.
  let userOpHash: Hex;
  try {
    userOpHash = (await publicClient.readContract({
      address: ENTRY_POINT_ADDRESS,
      abi: entryPointAbi,
      functionName: "getUserOpHash",
      args: [userOp],
    })) as Hex;
    console.log("UserOp hash:", userOpHash);

    const signedMessage = await ownerAccount.signMessage({
      message: { raw: userOpHash },
    });
    userOp.signature = signedMessage;
  } catch (e: any) {
    throw new Error(
      `[Step 8 — sign UserOp] ${e.shortMessage ?? e.message}`
    );
  }

  // Step 9: Submit via handleOps.
  console.log("\n🚀 Submitting via direct handleOps...");
  let txHash: Hex;
  try {
    txHash = await walletClient.writeContract({
      address: ENTRY_POINT_ADDRESS,
      abi: entryPointAbi,
      functionName: "handleOps",
      args: [
        [userOp],
        beneficiary, // Bug #23: configurable beneficiary
      ],
      gas: HANDLE_OPS_GAS, // Bug #20: configurable via env
    });
  } catch (e: any) {
    throw new Error(
      `[Step 9 — handleOps] Transaction submission failed: ${e.shortMessage ?? e.message}`
    );
  }

  console.log("Tx hash:", txHash);
  console.log("Waiting for receipt...");

  // Bug #22: Add timeout to avoid hanging indefinitely on slow RSK blocks.
  let receipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 120_000, // 2 minutes
    });
  } catch (e: any) {
    throw new Error(
      `[Step 9 — waitForReceipt] Transaction not mined within timeout: ${e.shortMessage ?? e.message}\n` +
      `  Check manually: https://explorer.testnet.rootstock.io/tx/${txHash}`
    );
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Status:", receipt.status);
  console.log("  Block: ", receipt.blockNumber);
  console.log("  Gas:   ", receipt.gasUsed.toString());
  console.log("  Logs:  ", receipt.logs.length);
  console.log("═══════════════════════════════════════════════════");

  if (receipt.status === "success") {
    console.log("\n✅ UserOp executed successfully!");
    console.log(
      `   View: https://explorer.testnet.rootstock.io/tx/${txHash}`
    );
  } else {
    console.log("\n❌ Transaction reverted on-chain.");
    console.log(
      `   View: https://explorer.testnet.rootstock.io/tx/${txHash}`
    );
  }
}

main().catch((err) => {
  console.error("\n❌ Error:", err.shortMessage || err.message);
  if (err.cause?.cause?.details) {
    console.error("   Details:", err.cause.cause.details);
  }
  process.exit(1);
});