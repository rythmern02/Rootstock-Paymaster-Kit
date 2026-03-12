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

// ─── Config & Guards ─────────────────────────────────────────────────────────

const RPC_URL =
    process.env.RSK_TESTNET_RPC_URL || "https://public-node.testnet.rsk.co";
const ENTRY_POINT_ADDRESS = process.env.ENTRY_POINT_ADDRESS as Hex;
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS as Hex;
const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS as Hex;
const COORDINATOR_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY as Hex;

// Bug #9: USER_PRIVATE_KEY added to validation guard.
const USER_PRIVATE_KEY = process.env.USER_PRIVATE_KEY as Hex;

// Bug #10: TOKEN_ADDRESS read from .env instead of hardcoded.
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS as Hex;

if (
    !ENTRY_POINT_ADDRESS ||
    !FACTORY_ADDRESS ||
    !PAYMASTER_ADDRESS ||
    !COORDINATOR_PRIVATE_KEY ||
    !USER_PRIVATE_KEY || // Bug #9
    !TOKEN_ADDRESS // Bug #10
) {
    throw new Error(
        "Missing required .env vars. Required:\n" +
        "  ENTRY_POINT_ADDRESS, FACTORY_ADDRESS, PAYMASTER_ADDRESS,\n" +
        "  WALLET_PRIVATE_KEY, USER_PRIVATE_KEY, TOKEN_ADDRESS"
    );
}

// ─── Clients ─────────────────────────────────────────────────────────────────

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

const erc20Abi = [
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function waitForTx(hash: Hex, label: string) {
    console.log(`   Tx: ${hash}`);
    // Bug #22: Add timeout so the script does not hang indefinitely.
    const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 120_000, // 2 minutes
    });
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
    console.log("Token address:   ", TOKEN_ADDRESS); // Bug #10

    // 1. Compute Smart Account address
    let smartAccountAddress: Hex;
    try {
        smartAccountAddress = (await publicClient.readContract({
            address: FACTORY_ADDRESS,
            abi: factoryAbi,
            functionName: "getAddress",
            args: [ownerAccount.address, 0n],
        })) as Hex;
    } catch (e: any) {
        throw new Error(
            `[Step 0 — getAddress] Failed to compute smart account address: ${e.message}`
        );
    }
    console.log("Smart Account:   ", smartAccountAddress);
    console.log("Paymaster:       ", PAYMASTER_ADDRESS);
    console.log("Coordinator EOA: ", coordinatorAccount.address);

    // 2. Check & deposit for Paymaster in EntryPoint
    console.log("\n--- Step 1: Paymaster Deposit ---");
    let currentDeposit: bigint;
    try {
        currentDeposit = (await publicClient.readContract({
            address: ENTRY_POINT_ADDRESS,
            abi: entryPointAbi,
            functionName: "balanceOf",
            args: [PAYMASTER_ADDRESS],
        })) as bigint;
    } catch (e: any) {
        throw new Error(
            `[Step 1 — balanceOf] Failed to read paymaster deposit: ${e.message}`
        );
    }
    console.log("Current deposit:", formatEther(currentDeposit), "RBTC");

    const MIN_DEPOSIT = parseEther("0.0001");
    if (currentDeposit < MIN_DEPOSIT) {
        const depositAmount = MIN_DEPOSIT - currentDeposit;
        console.log(`Depositing ${formatEther(depositAmount)} RBTC for paymaster...`);
        try {
            const hash = await walletClient.writeContract({
                address: ENTRY_POINT_ADDRESS,
                abi: entryPointAbi,
                functionName: "depositTo",
                args: [PAYMASTER_ADDRESS],
                value: depositAmount,
            });
            await waitForTx(hash, "Paymaster deposit");
        } catch (e: any) {
            throw new Error(`[Step 1 — depositTo] Failed to deposit: ${e.message}`);
        }
    } else {
        console.log("✅ Deposit sufficient");
    }

    // 3. Deploy Smart Account if needed
    console.log("\n--- Step 2: Smart Account Deployment ---");
    let isDeployed: boolean;
    try {
        const accountCode = await publicClient.getCode({ address: smartAccountAddress });
        isDeployed = accountCode !== undefined && accountCode !== "0x";
    } catch (e: any) {
        throw new Error(
            `[Step 2 — getCode] Failed to check account deployment: ${e.message}`
        );
    }

    if (!isDeployed) {
        console.log("Deploying Smart Account via factory...");
        try {
            const hash = await walletClient.writeContract({
                address: FACTORY_ADDRESS,
                abi: factoryAbi,
                functionName: "createAccount",
                args: [ownerAccount.address, 0n],
            });
            await waitForTx(hash, "Account deployment");
        } catch (e: any) {
            throw new Error(`[Step 2 — createAccount] Failed: ${e.message}`);
        }
    } else {
        console.log("✅ Already deployed");
    }

    // 4. Fund Smart Account with some tRBTC
    console.log("\n--- Step 3: Fund Smart Account with tRBTC ---");
    let accountBalance: bigint;
    try {
        accountBalance = await publicClient.getBalance({ address: smartAccountAddress });
    } catch (e: any) {
        throw new Error(`[Step 3 — getBalance] ${e.message}`);
    }
    console.log("Current balance:", formatEther(accountBalance), "RBTC");

    const MIN_BALANCE = parseEther("0.0001");
    if (accountBalance < MIN_BALANCE) {
        const sendAmount = MIN_BALANCE - accountBalance;
        console.log(`Sending ${formatEther(sendAmount)} tRBTC to smart account...`);
        try {
            const hash = await walletClient.sendTransaction({
                to: smartAccountAddress,
                value: sendAmount,
            });
            await waitForTx(hash, "Fund account");
        } catch (e: any) {
            throw new Error(`[Step 3 — sendTransaction] Failed: ${e.message}`);
        }
    } else {
        console.log("✅ Balance sufficient");
    }

    // 5. Mint tokens to Smart Account (MockToken only — owner-controlled)
    console.log("\n--- Step 4: Mint Tokens ---");
    let tokenBalance: bigint;
    try {
        tokenBalance = (await publicClient.readContract({
            address: TOKEN_ADDRESS,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [smartAccountAddress],
        })) as bigint;
    } catch (e: any) {
        throw new Error(`[Step 4 — balanceOf token] ${e.message}`);
    }
    console.log("Token balance:", formatEther(tokenBalance), "tokens");

    const MIN_TOKENS = parseEther("1000");
    if (tokenBalance < MIN_TOKENS) {
        console.log("Minting 10000 tokens to smart account...");
        console.log("  (Mint will only succeed if TOKEN_ADDRESS is a MockToken owned by coordinator)");
        try {
            const hash = await walletClient.writeContract({
                address: TOKEN_ADDRESS,
                abi: erc20Abi,
                functionName: "mint",
                args: [smartAccountAddress, parseEther("10000")],
            });
            await waitForTx(hash, "Mint tokens");
        } catch (e: any) {
            throw new Error(
                `[Step 4 — mint] Failed. If using a real token, fund the smart account manually. Error: ${e.message}`
            );
        }
    } else {
        console.log("✅ Token balance sufficient");
    }

    // 6. Approve Paymaster to pull tokens from Smart Account
    console.log("\n--- Step 5: Token Approval for Paymaster ---");
    let currentAllowance: bigint;
    try {
        currentAllowance = (await publicClient.readContract({
            address: TOKEN_ADDRESS,
            abi: erc20Abi,
            functionName: "allowance",
            args: [smartAccountAddress, PAYMASTER_ADDRESS],
        })) as bigint;
    } catch (e: any) {
        throw new Error(`[Step 5 — allowance] ${e.message}`);
    }
    console.log("Current allowance:", formatEther(currentAllowance), "tokens");

    const MAX_UINT256 = 2n ** 256n - 1n;
    if (currentAllowance < parseEther("1000")) {
        console.log("Setting unlimited approval via Smart Account execute()...");
        try {
            const approveCalldata = encodeFunctionData({
                abi: erc20Abi,
                functionName: "approve",
                args: [PAYMASTER_ADDRESS, MAX_UINT256],
            });
            const hash = await walletClient.writeContract({
                account: ownerAccount,
                address: smartAccountAddress,
                abi: simpleAccountAbi,
                functionName: "execute",
                args: [TOKEN_ADDRESS, 0n, approveCalldata],
            });
            await waitForTx(hash, "Token approval");
        } catch (e: any) {
            throw new Error(`[Step 5 — approve] Failed: ${e.message}`);
        }
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
