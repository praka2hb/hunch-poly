/**
 * useSafeSetup — Background hook that derives + deploys the Safe wallet
 * automatically after login, so it's ready before the user tries to deposit.
 *
 * Runs once when:
 *   - `backendUser` exists
 *   - `polymarketOnboardingStep < 2` (Safe not yet deployed)
 *   - An embedded Ethereum wallet is available from Privy
 *
 * This is idempotent — if the Safe is already deployed on-chain, it just
 * records that fact in the backend and updates the local user.
 */

import { useCallback, useEffect, useRef } from "react";
import { useUser } from "@/contexts/UserContext";
import { useEmbeddedEthereumWallet } from "@privy-io/expo";
import { api } from "@/lib/api";
import { deriveSafeAddress, getRelayClient } from "@/lib/polymarketClient";
import { isSafeDeployedOnChain } from "@/lib/polygon";
import { ethers } from "ethers";

export function useSafeSetup() {
    const { backendUser, setBackendUser } = useUser();
    const { wallets } = useEmbeddedEthereumWallet();
    const runningRef = useRef(false);

    const setup = useCallback(async () => {
        if (runningRef.current) return;
        if (!backendUser) return;

        // Already completed steps 1+2 — nothing to do
        const step = backendUser.polymarketOnboardingStep ?? 0;
        if (step >= 2) return;

        const wallet = wallets?.[0];
        if (!wallet) return;

        runningRef.current = true;

        try {
            // ── Step 1: Derive Safe address ────────────────────────────────
            let safeAddr = backendUser.safeAddress;

            if (!safeAddr || step < 1) {
                console.log("[useSafeSetup] Step 1: Deriving Safe address...");

                // Tell backend to derive + store the Safe address
                const deriveResult = await api.deriveSafe();
                safeAddr = deriveResult.safeAddress;

                // Update local user immediately so DepositSheet can use it
                await setBackendUser({
                    ...backendUser,
                    safeAddress: safeAddr,
                    polymarketOnboardingStep: Math.max(step, 1),
                });

                console.log("[useSafeSetup] Step 1 done — Safe derived:", safeAddr);
            }

            // ── Step 2: Deploy Safe on-chain ───────────────────────────────
            if (step < 2 && safeAddr) {
                console.log("[useSafeSetup] Step 2: Deploying Safe...");

                // Check if already deployed on-chain (e.g. from a previous session)
                const alreadyDeployed = await isSafeDeployedOnChain(safeAddr);

                if (alreadyDeployed) {
                    console.log("[useSafeSetup] Safe already deployed on-chain, skipping relay deploy");
                    await api.confirmSafeDeployed("already-deployed");
                } else {
                    // Get a signer from the Privy embedded wallet
                    const provider = await wallet.getProvider();
                    await provider.request({
                        method: "wallet_switchEthereumChain",
                        params: [{ chainId: "0x89" }], // Polygon (137)
                    });
                    const ethersProvider = new ethers.providers.Web3Provider(provider);
                    const signer = ethersProvider.getSigner();

                    const relayClient = await getRelayClient(signer, safeAddr);
                    const deployResponse = await relayClient.deploy();

                    // Poll until mined
                    const { RelayerTransactionState } = await import(
                        "@polymarket/builder-relayer-client"
                    );
                    const deployResult = await relayClient.pollUntilState(
                        deployResponse.transactionID,
                        [
                            RelayerTransactionState.STATE_MINED,
                            RelayerTransactionState.STATE_CONFIRMED,
                            RelayerTransactionState.STATE_FAILED,
                        ],
                        "60",
                        3000,
                    );

                    if (
                        !deployResult ||
                        deployResult.state === RelayerTransactionState.STATE_FAILED
                    ) {
                        throw new Error("Safe deployment failed via relayer");
                    }

                    const txHash =
                        deployResult.transactionHash ||
                        deployResult.proxyAddress ||
                        "";
                    await api.confirmSafeDeployed(txHash);
                    console.log("[useSafeSetup] Step 2 done — Safe deployed:", txHash);
                }

                // Update local user
                await setBackendUser({
                    ...backendUser,
                    safeAddress: safeAddr,
                    safeDeployed: true,
                    polymarketOnboardingStep: Math.max(
                        backendUser.polymarketOnboardingStep ?? 0,
                        2,
                    ),
                });
            }
        } catch (err) {
            // Non-fatal — the MarketTradeSheet inline onboarding is the fallback
            console.warn("[useSafeSetup] Background setup failed (non-fatal):", err);
        } finally {
            runningRef.current = false;
        }
    }, [backendUser, wallets, setBackendUser]);

    useEffect(() => {
        setup();
    }, [setup]);
}
