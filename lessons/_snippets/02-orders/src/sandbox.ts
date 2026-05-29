/**
 * Canonical DeepBook sandbox connection helper.
 *
 * Reads the deployment manifest (written by `pnpm deploy-all` in the
 * deepbook-sandbox repo) and constructs a DeepBook SDK client configured for
 * the local sandbox. This file is the shared basis copied by sibling snippets,
 * so keep it clean and correct.
 *
 * Entry points (increasing setup complexity):
 *   createReadOnlyClient()       — no keypair, no funding
 *   setupSandbox()               — fresh keypair + faucet funding (Node/fs)
 *   setupSandboxBrowser()        — same, but loads manifest + funds over HTTP
 *   setupWithBalanceManager()    — above + on-chain BalanceManager
 *   assertSandboxUp()            — throws an actionable error if manifest absent
 */

import { deepbook, type DeepBookClient } from "@mysten/deepbook-v3";
import type { CoinMap, DeepbookPackageIds, PoolMap } from "@mysten/deepbook-v3";
import type { BalanceManager } from "@mysten/deepbook-v3";
import type { ClientWithExtensions } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { SUI_FRAMEWORK_ADDRESS } from "@mysten/sui/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of the deployment manifest written by deploy-all.ts */
export interface DeploymentManifest {
    network: { type: string; rpcUrl: string; faucetUrl: string };
    packages: Record<
        string,
        {
            packageId: string;
            objects: Array<{ objectId: string; objectType: string }>;
            transactionDigest: string;
        }
    >;
    pools: Record<string, { poolId: string; baseCoinType: string; quoteCoinType: string }>;
    deployerAddress: string;
    deploymentTime: string;
}

export type SandboxClient = ClientWithExtensions<{ deepbook: DeepBookClient }>;

export interface SandboxConfig {
    client: SandboxClient;
    keypair: Ed25519Keypair;
    address: string;
    manifest: DeploymentManifest;
}

export interface SandboxConfigWithBM extends SandboxConfig {
    balanceManagerId: string;
    balanceManagerKey: string;
}

/** Tokens the sandbox faucet can dispense. */
export type FaucetToken = "SUI" | "DEEP" | "USDC";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOCALNET_URL = "http://127.0.0.1:9000";
const FAUCET_URL = "http://127.0.0.1:9009";
const BALANCE_MANAGER_KEY = "MANAGER_1";
const SUI_ADDRESS = SUI_FRAMEWORK_ADDRESS;

// ---------------------------------------------------------------------------
// Manifest loading & ID extraction
// ---------------------------------------------------------------------------

export async function loadManifest(): Promise<DeploymentManifest> {
    // Node-only fs/os/path are imported dynamically so this module can also be
    // bundled for the browser (where the manifest is loaded via fetch instead —
    // see setupSandboxBrowser).
    const { readFile } = await import("node:fs/promises");
    const { homedir } = await import("node:os");
    const { join } = await import("node:path");

    const manifestPath =
        process.env.DEEPBOOK_SANDBOX_DEPLOYMENTS ??
        join(homedir(), "workspace/deepbook-sandbox/sandbox/deployments/localnet.json");

    try {
        const raw = await readFile(manifestPath, "utf-8");
        return JSON.parse(raw) as DeploymentManifest;
    } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
            throw new Error(
                `Deployment manifest not found at ${manifestPath}.\n` +
                    `Start the sandbox and run "cd sandbox && pnpm deploy-all" first.`,
            );
        }
        throw err;
    }
}

/**
 * Throws an actionable error if the sandbox manifest is not present.
 * Use in test `beforeAll` to fail fast with a clear message when the
 * sandbox is down.
 */
export async function assertSandboxUp(): Promise<void> {
    await loadManifest();
}

function extractObjectId(
    objects: Array<{ objectId: string; objectType: string }>,
    typeMatch: string,
    exclude?: string,
): string {
    const obj = objects.find(
        (o) => o.objectType.includes(typeMatch) && (!exclude || !o.objectType.includes(exclude)),
    );
    if (!obj) {
        throw new Error(`Could not find object matching "${typeMatch}" in deployment manifest`);
    }
    return obj.objectId;
}

function buildPackageIds(manifest: DeploymentManifest): DeepbookPackageIds {
    const deepbookPkg = manifest.packages.deepbook;
    const tokenPkg = manifest.packages.token;

    return {
        DEEPBOOK_PACKAGE_ID: deepbookPkg.packageId,
        REGISTRY_ID: extractObjectId(deepbookPkg.objects, "Registry", "MarginRegistry"),
        DEEP_TREASURY_ID: extractObjectId(tokenPkg.objects, "ProtectedTreasury"),
    };
}

function buildCoinMap(manifest: DeploymentManifest): CoinMap {
    return {
        DEEP: {
            address: manifest.packages.token.packageId,
            type: manifest.pools.DEEP_SUI.baseCoinType,
            scalar: 1_000_000, // 6 decimals
        },
        SUI: {
            address: SUI_ADDRESS,
            type: `${SUI_ADDRESS}::sui::SUI`,
            scalar: 1_000_000_000, // 9 decimals
        },
        USDC: {
            address: manifest.packages.usdc.packageId,
            type: manifest.pools.SUI_USDC.quoteCoinType,
            scalar: 1_000_000, // 6 decimals
        },
    };
}

function buildPoolMap(manifest: DeploymentManifest): PoolMap {
    return {
        DEEP_SUI: {
            address: manifest.pools.DEEP_SUI.poolId,
            baseCoin: "DEEP",
            quoteCoin: "SUI",
        },
        SUI_USDC: {
            address: manifest.pools.SUI_USDC.poolId,
            baseCoin: "SUI",
            quoteCoin: "USDC",
        },
    };
}

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

function createClient(
    address: string,
    manifest: DeploymentManifest,
    balanceManagers?: Record<string, BalanceManager>,
): SandboxClient {
    return new SuiGrpcClient({
        network: "custom",
        baseUrl: LOCALNET_URL,
    }).$extend(
        deepbook({
            address,
            packageIds: buildPackageIds(manifest),
            coins: buildCoinMap(manifest),
            pools: buildPoolMap(manifest),
            balanceManagers,
        }),
    );
}

// ---------------------------------------------------------------------------
// Faucet funding (Node)
// ---------------------------------------------------------------------------

async function fundFromFaucet(address: string, token: FaucetToken): Promise<void> {
    const resp = await fetch(`${FAUCET_URL}/faucet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, token }),
    });
    if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Faucet request failed for ${token}: ${resp.status} ${body}`);
    }
}

async function fundWallet(address: string): Promise<void> {
    // Fund all three coins: SUI (gas + quote), DEEP (base/fees), USDC (quote).
    await fundFromFaucet(address, "SUI");
    await fundFromFaucet(address, "DEEP");
    await fundFromFaucet(address, "USDC");
}

// ---------------------------------------------------------------------------
// Faucet funding (browser — proxied via Vite to the faucet)
// ---------------------------------------------------------------------------

async function fundFromFaucetBrowser(address: string, token: FaucetToken): Promise<void> {
    const resp = await fetch(`/faucet`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, token }),
    });
    if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Faucet request failed for ${token}: ${resp.status} ${body}`);
    }
}

async function fundWalletBrowser(address: string): Promise<void> {
    await fundFromFaucetBrowser(address, "SUI");
    await fundFromFaucetBrowser(address, "DEEP");
    await fundFromFaucetBrowser(address, "USDC");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a read-only client (no keypair, no funding).
 * Suitable for querying order books, mid prices, etc.
 */
export async function createReadOnlyClient(): Promise<{
    client: SandboxClient;
    manifest: DeploymentManifest;
}> {
    const manifest = await loadManifest();
    const zeroAddress = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const client = createClient(zeroAddress, manifest);
    return { client, manifest };
}

/**
 * Full setup (Node): fresh keypair, faucet-funded wallet, configured DeepBook
 * client. Suitable for swaps (no BalanceManager needed).
 */
export async function setupSandbox(): Promise<SandboxConfig> {
    const manifest = await loadManifest();
    const keypair = new Ed25519Keypair();
    const address = keypair.toSuiAddress();

    console.log(`Generated keypair: ${address}`);
    console.log("Funding wallet from sandbox faucet...");
    await fundWallet(address);
    console.log("Wallet funded with SUI, DEEP and USDC.\n");

    const client = createClient(address, manifest);
    return { client, keypair, address, manifest };
}

/**
 * Full setup (browser): like setupSandbox, but loads the manifest over HTTP
 * (`fetch('/localnet.json')`, served by the Vite middleware) and funds via the
 * proxied `/faucet` endpoint. Used by the in-browser smoke driver.
 */
export async function setupSandboxBrowser(): Promise<SandboxConfig> {
    const resp = await fetch("/localnet.json");
    if (!resp.ok) {
        throw new Error(
            `Could not load manifest from /localnet.json (${resp.status}). Is the Vite dev server running?`,
        );
    }
    const manifest = (await resp.json()) as DeploymentManifest;

    const keypair = new Ed25519Keypair();
    const address = keypair.toSuiAddress();
    await fundWalletBrowser(address);

    const client = createClient(address, manifest);
    return { client, keypair, address, manifest };
}

// ---------------------------------------------------------------------------
// Private helper — shared between Node and browser BM-creation paths
// ---------------------------------------------------------------------------

interface BalanceManagerClientResult {
    client: SandboxClient;
    balanceManagerId: string;
    balanceManagerKey: string;
}

async function createBalanceManagerClient(
    baseClient: SandboxClient,
    keypair: Ed25519Keypair,
    address: string,
    manifest: DeploymentManifest,
): Promise<BalanceManagerClientResult> {
    const tx = new Transaction();
    baseClient.deepbook.balanceManager.createAndShareBalanceManager()(tx);

    const result = await baseClient.core.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        include: { effects: true, objectTypes: true },
    });

    if (result.$kind === "FailedTransaction") {
        throw new Error(
            `BalanceManager creation failed: ${JSON.stringify(result.FailedTransaction)}`,
        );
    }

    const objectTypes = result.Transaction?.objectTypes ?? {};
    const balanceManagerId = result.Transaction?.effects?.changedObjects?.find(
        (obj) =>
            obj.idOperation === "Created" && objectTypes[obj.objectId]?.includes("BalanceManager"),
    )?.objectId;

    if (!balanceManagerId) {
        throw new Error("Failed to extract BalanceManager ID from transaction result");
    }

    await baseClient.core.waitForTransaction({ digest: result.Transaction!.digest });

    const client = createClient(address, manifest, {
        [BALANCE_MANAGER_KEY]: { address: balanceManagerId },
    });

    return { client, balanceManagerId, balanceManagerKey: BALANCE_MANAGER_KEY };
}

/**
 * Full setup + on-chain BalanceManager creation.
 * Suitable for limit orders, market orders, and order lifecycle examples.
 */
export async function setupWithBalanceManager(): Promise<SandboxConfigWithBM> {
    const { keypair, address, manifest } = await setupSandbox();

    const tempClient = createClient(address, manifest);

    console.log("Creating BalanceManager on-chain...");
    const { client, balanceManagerId, balanceManagerKey } = await createBalanceManagerClient(
        tempClient,
        keypair,
        address,
        manifest,
    );
    console.log(`BalanceManager created: ${balanceManagerId}\n`);

    return { client, keypair, address, manifest, balanceManagerId, balanceManagerKey };
}

/**
 * Full setup + on-chain BalanceManager creation (browser variant).
 * Like setupWithBalanceManager, but loads the manifest over HTTP and funds
 * via the proxied `/faucet` endpoint. Used by the in-browser smoke driver.
 */
export async function setupWithBalanceManagerBrowser(): Promise<SandboxConfigWithBM> {
    const resp = await fetch("/localnet.json");
    if (!resp.ok) {
        throw new Error(
            `Could not load manifest from /localnet.json (${resp.status}). Is the Vite dev server running?`,
        );
    }
    const manifest = (await resp.json()) as DeploymentManifest;

    const keypair = new Ed25519Keypair();
    const address = keypair.toSuiAddress();
    await fundWalletBrowser(address);

    const tempClient = createClient(address, manifest);
    const { client, balanceManagerId, balanceManagerKey } = await createBalanceManagerClient(
        tempClient,
        keypair,
        address,
        manifest,
    );

    return { client, keypair, address, manifest, balanceManagerId, balanceManagerKey };
}

/**
 * Sign and execute a transaction, throwing on failure.
 * Waits for the transaction to be fully indexed before returning, so subsequent
 * transactions can safely reference modified objects. Includes rich effects
 * (`effects` + `balanceChanges`) for callers that need to inspect deltas.
 */
export async function signAndExecute(
    client: SandboxClient,
    keypair: Ed25519Keypair,
    tx: Transaction,
) {
    const result = await client.core.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        include: { effects: true, balanceChanges: true },
    });

    if (result.$kind === "FailedTransaction") {
        throw new Error(`Transaction failed: ${JSON.stringify(result.FailedTransaction)}`);
    }

    await client.core.waitForTransaction({ digest: result.Transaction!.digest });

    return result.Transaction!;
}
