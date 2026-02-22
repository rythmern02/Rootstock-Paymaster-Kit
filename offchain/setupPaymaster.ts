// setupPaymaster.ts — One-time setup for ERC-4337 on RSK Testnet
// Run this BEFORE executeUserOp.ts
import "dotenv/config";
import {
    createPublicClient,
    createWalletClient,
    http,
    parseEther,
    encodeFunctionData,
    formatEther,
    type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { rootstockTestnet } from "viem/chains";

// ─── Config ──────────────────────────────────────────────────────────────────
const RPC_URL = process.env.RSK_TESTNET_RPC_URL || "https://public-node.testnet.rsk.co";
const ENTRY_POINT_ADDRESS = process.env.ENTRY_POINT_ADDRESS as Hex;
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS as Hex;
const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS as Hex;
const COORDINATOR_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY as Hex;
const USER_PRIVATE_KEY = process.env.USER_PRIVATE_KEY as Hex;

// MockToken deployed alongside the paymaster (from broadcast logs)
const MOCK_TOKEN_ADDRESS = "0x570B34fd586ef4FeFD9884F3b8D47555D4990De3" as Hex;

if (!ENTRY_POINT_ADDRESS || !FACTORY_ADDRESS || !PAYMASTER_ADDRESS || !COORDINATOR_PRIVATE_KEY) {
    throw new Error("Missing required .env vars");
}

const publicClient = createPublicClient({
    chain: rootstockTestnet,
    transport: http(RPC_URL),
});

const coordinatorAccount = privateKeyToAccount(COORDINATOR_PRIVATE_KEY);
const ownerAccount = privateKeyToAccount(USER_PRIVATE_KEY);

const walletClient = createWalletClient({
    account: coordinatorAccount,
    chain: rootstockTestnet,
    transport: http(RPC_URL),
});

// ─── ABIs ────────────────────────────────────────────────────────────────────
const entryPointAbi = [
    {
        name: "depositTo",
        type: "function",
        inputs: [{ name: "account", type: "address" }],
        outputs: [],
        stateMutability: "payable",
    },
    {
        name: "balanceOf",
        type: "function",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ type: "uint256" }],
        stateMutability: "view",
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

const mockTokenAbi = [
    {
        name: "mint",
        type: "function",
        inputs: [
            { name: "to", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        name: "balanceOf",
        type: "function",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ type: "uint256" }],
        stateMutability: "view",
    },
    {
        name: "allowance",
        type: "function",
        inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
        ],
        outputs: [{ type: "uint256" }],
        stateMutability: "view",
    },
    {
        name: "approve",
        type: "function",
        inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [{ type: "bool" }],
        stateMutability: "nonpayable",
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

async function waitForTx(hash: Hex, label: string) {
    console.log(`   Tx: ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`   Status: ${receipt.status} (block ${receipt.blockNumber})`);
    if (receipt.status !== "success") {
        throw new Error(`${label} transaction reverted!`);
    }
    return receipt;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
    console.log("═══════════════════════════════════════════════════");
    console.log("  ERC-4337 Setup Script — RSK Testnet");
    console.log("═══════════════════════════════════════════════════\n");

    // 1. Compute Smart Account address
    const smartAccountAddress = (await publicClient.readContract({
        address: FACTORY_ADDRESS,
        abi: factoryAbi,
        functionName: "getAddress",
        args: [ownerAccount.address, 0n],
    })) as Hex;
    console.log("Smart Account:   ", smartAccountAddress);
    console.log("Paymaster:       ", PAYMASTER_ADDRESS);
    console.log("MockToken:       ", MOCK_TOKEN_ADDRESS);
    console.log("Coordinator EOA: ", coordinatorAccount.address);

    // 2. Check & deposit for Paymaster in EntryPoint
    console.log("\n--- Step 1: Paymaster Deposit ---");
    const currentDeposit = (await publicClient.readContract({
        address: ENTRY_POINT_ADDRESS,
        abi: entryPointAbi,
        functionName: "balanceOf",
        args: [PAYMASTER_ADDRESS],
    })) as bigint;
    console.log("Current deposit:", formatEther(currentDeposit), "RBTC");

    const MIN_DEPOSIT = parseEther("0.0001"); // 0.0001 RBTC should cover many ops
    if (currentDeposit < MIN_DEPOSIT) {
        const depositAmount = MIN_DEPOSIT - currentDeposit;
        console.log(`Depositing ${formatEther(depositAmount)} RBTC for paymaster...`);
        const hash = await walletClient.writeContract({
            address: ENTRY_POINT_ADDRESS,
            abi: entryPointAbi,
            functionName: "depositTo",
            args: [PAYMASTER_ADDRESS],
            value: depositAmount,
        });
        await waitForTx(hash, "Paymaster deposit");
    } else {
        console.log("✅ Deposit sufficient");
    }

    // 3. Deploy Smart Account if needed
    console.log("\n--- Step 2: Smart Account Deployment ---");
    const accountCode = await publicClient.getCode({ address: smartAccountAddress });
    const isDeployed = accountCode !== undefined && accountCode !== "0x";

    if (!isDeployed) {
        console.log("Deploying Smart Account via factory...");
        const hash = await walletClient.writeContract({
            address: FACTORY_ADDRESS,
            abi: factoryAbi,
            functionName: "createAccount",
            args: [ownerAccount.address, 0n],
        });
        await waitForTx(hash, "Account deployment");
    } else {
        console.log("✅ Already deployed");
    }

    // 4. Fund Smart Account with some tRBTC (needed for the test UserOp)
    console.log("\n--- Step 3: Fund Smart Account with tRBTC ---");
    const accountBalance = await publicClient.getBalance({ address: smartAccountAddress });
    console.log("Current balance:", formatEther(accountBalance), "RBTC");

    const MIN_BALANCE = parseEther("0.0001");
    if (accountBalance < MIN_BALANCE) {
        const sendAmount = MIN_BALANCE - accountBalance;
        console.log(`Sending ${formatEther(sendAmount)} tRBTC to smart account...`);
        const hash = await walletClient.sendTransaction({
            to: smartAccountAddress,
            value: sendAmount,
        });
        await waitForTx(hash, "Fund account");
    } else {
        console.log("✅ Balance sufficient");
    }

    // 5. Mint MockTokens to Smart Account
    console.log("\n--- Step 4: Mint MockTokens ---");
    const tokenBalance = (await publicClient.readContract({
        address: MOCK_TOKEN_ADDRESS,
        abi: mockTokenAbi,
        functionName: "balanceOf",
        args: [smartAccountAddress],
    })) as bigint;
    console.log("Token balance:", formatEther(tokenBalance), "rUSD");

    const MIN_TOKENS = parseEther("1000");
    if (tokenBalance < MIN_TOKENS) {
        console.log("Minting 10000 rUSD to smart account...");
        const hash = await walletClient.writeContract({
            address: MOCK_TOKEN_ADDRESS,
            abi: mockTokenAbi,
            functionName: "mint",
            args: [smartAccountAddress, parseEther("10000")],
        });
        await waitForTx(hash, "Mint tokens");
    } else {
        console.log("✅ Token balance sufficient");
    }

    // 6. Approve Paymaster to pull tokens from Smart Account
    //    Since only owner or EntryPoint can call execute(), and we are the owner,
    //    we call execute() on the account to do an ERC-20 approve.
    console.log("\n--- Step 5: Token Approval for Paymaster ---");
    const currentAllowance = (await publicClient.readContract({
        address: MOCK_TOKEN_ADDRESS,
        abi: mockTokenAbi,
        functionName: "allowance",
        args: [smartAccountAddress, PAYMASTER_ADDRESS],
    })) as bigint;
    console.log("Current allowance:", formatEther(currentAllowance), "rUSD");

    const MAX_UINT256 = 2n ** 256n - 1n;
    if (currentAllowance < parseEther("1000")) {
        console.log("Setting unlimited approval...");
        // Build the approve calldata
        const approveCalldata = encodeFunctionData({
            abi: mockTokenAbi,
            functionName: "approve",
            args: [PAYMASTER_ADDRESS, MAX_UINT256],
        });
        // Call execute() on the Smart Account as the owner
        const hash = await walletClient.writeContract({
            address: smartAccountAddress,
            abi: simpleAccountAbi,
            functionName: "execute",
            args: [MOCK_TOKEN_ADDRESS, 0n, approveCalldata],
        });
        await waitForTx(hash, "Token approval");
    } else {
        console.log("✅ Allowance sufficient");
    }

    console.log("\n═══════════════════════════════════════════════════");
    console.log("  ✅ Setup Complete! You can now run:");
    console.log("  npx tsx offchain/executeUserOp.ts");
    console.log("═══════════════════════════════════════════════════");
}

main().catch((err) => {
    console.error("\n❌ Error:", err.shortMessage || err.message);
    if (err.cause?.cause?.details) {
        console.error("   Details:", err.cause.cause.details);
    }
    process.exit(1);
});
