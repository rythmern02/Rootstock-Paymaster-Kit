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
import { getPaymasterSignature, getPaymasterStubData } from "./paymasterService";

// ─── Config ──────────────────────────────────────────────────────────────────
const RPC_URL = process.env.RSK_TESTNET_RPC_URL || "https://public-node.testnet.rsk.co";
const ENTRY_POINT_ADDRESS = process.env.ENTRY_POINT_ADDRESS as Hex;
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS as Hex;
const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS as Hex;
const USER_PRIVATE_KEY = process.env.USER_PRIVATE_KEY as Hex;
const COORDINATOR_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY as Hex;

if (!ENTRY_POINT_ADDRESS || !FACTORY_ADDRESS || !PAYMASTER_ADDRESS || !USER_PRIVATE_KEY || !COORDINATOR_PRIVATE_KEY) {
  throw new Error("Missing required .env vars: ENTRY_POINT_ADDRESS, FACTORY_ADDRESS, PAYMASTER_ADDRESS, USER_PRIVATE_KEY, WALLET_PRIVATE_KEY");
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

  // 1. Compute the Smart Account address
  const smartAccountAddress = (await publicClient.readContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "getAddress",
    args: [ownerAccount.address, 0n],
  })) as Hex;
  console.log("Smart Account:  ", smartAccountAddress);
  console.log("Owner EOA:      ", ownerAccount.address);
  console.log("Coordinator EOA:", coordinatorAccount.address);

  // 2. Pre-flight checks
  console.log("\n--- Pre-flight Checks ---");

  // Check if smart account is deployed
  const accountCode = await publicClient.getCode({ address: smartAccountAddress });
  const isDeployed = accountCode !== undefined && accountCode !== "0x";
  console.log("Account deployed:", isDeployed);

  // Check paymaster deposit in EntryPoint
  const paymasterDeposit = (await publicClient.readContract({
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

  // Get nonce from EntryPoint
  const nonce = (await publicClient.readContract({
    address: ENTRY_POINT_ADDRESS,
    abi: entryPointAbi,
    functionName: "getNonce",
    args: [smartAccountAddress, 0n],
  })) as bigint;
  console.log("Account nonce:  ", nonce.toString());

  // 3. Build initCode (only needed if account not deployed)
  let initCode: Hex = "0x";
  if (!isDeployed) {
    console.log("⚠️  Account not deployed — building initCode...");
    const createAccountCalldata = encodeFunctionData({
      abi: factoryAbi,
      functionName: "createAccount",
      args: [ownerAccount.address, 0n],
    });
    initCode = concat([FACTORY_ADDRESS, createAccountCalldata]);
    console.log("initCode built (length):", initCode.length);
  }

  // 4. Build callData — a call to SimpleAccount.execute()
  //    This sends 0.0000001 RBTC to the dead address with some test data
  const executeCallData = encodeFunctionData({
    abi: simpleAccountAbi,
    functionName: "execute",
    args: [
      "0x1111111111111111111111111111111111111111", // destination
      parseEther("0.0000001"),                       // value
      "0x1234" as Hex,                               // inner calldata
    ],
  });

  // 5. Get gas price from the node (RSK testnet uses ~0.06 gwei)
  const gasPrice = await publicClient.getGasPrice();
  console.log("Current gas price:", gasPrice.toString(), "wei");

  // Use higher gas limits for first deploy, lower for normal ops
  const verificationGasLimit = isDeployed ? 200_000n : 500_000n;
  const callGasLimit = 200_000n;
  const preVerificationGas = isDeployed ? 60_000n : 100_000n;

  // Pack gas fields (v0.7 format)
  const accountGasLimits = concat([
    pad(toHex(verificationGasLimit), { size: 16 }),
    pad(toHex(callGasLimit), { size: 16 }),
  ]);
  const gasFees = concat([
    pad(toHex(gasPrice), { size: 16 }),  // maxPriorityFeePerGas
    pad(toHex(gasPrice), { size: 16 }),  // maxFeePerGas
  ]);

  // 6. Build base UserOp
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

  // 7. Attach paymaster data
  const stub = getPaymasterStubData();

  // Build the v0.6-shaped object for the paymaster service
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

  userOp.paymasterAndData = await getPaymasterSignature(
    userOpForPaymaster,
    stub,
    rootstockTestnet.id // chainId 31
  );
  console.log("\nPaymaster data attached (length):", userOp.paymasterAndData.length);

  // 8. Sign the UserOp
  const userOpHash = (await publicClient.readContract({
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

  // 9. Submit via handleOps
  console.log("\n🚀 Submitting via direct handleOps...");
  const hash = await walletClient.writeContract({
    address: ENTRY_POINT_ADDRESS,
    abi: entryPointAbi,
    functionName: "handleOps",
    args: [[userOp], coordinatorAccount.address],
    gas: 2_000_000n, // explicit gas limit to avoid estimate failures
  });

  console.log("Tx hash:", hash);
  console.log("Waiting for receipt...");
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Status:", receipt.status);
  console.log("  Block: ", receipt.blockNumber);
  console.log("  Gas:   ", receipt.gasUsed.toString());
  console.log("  Logs:  ", receipt.logs.length);
  console.log("═══════════════════════════════════════════════════");

  if (receipt.status === "success") {
    console.log("\n✅ UserOp executed successfully!");
    console.log(`   View: https://explorer.testnet.rootstock.io/tx/${hash}`);
  } else {
    console.log("\n❌ Transaction reverted on-chain.");
  }
}

main().catch((err) => {
  console.error("\n❌ Error:", err.shortMessage || err.message);
  if (err.cause?.cause?.details) {
    console.error("   Details:", err.cause.cause.details);
  }
  process.exit(1);
});