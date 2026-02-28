import { api } from '@/lib/api';
import { AuthError, CopySettings, DelegationStatus } from '@/lib/types';
import { useEmbeddedSolanaWallet, usePrivy, useSessionSigners } from '@privy-io/expo';
import { useCallback, useState } from 'react';

// Key Quorum ID from environment
const KEY_QUORUM_ID = process.env.EXPO_PUBLIC_KEY_QUORUM_ID || '';

export interface CopyTradingSettings {
    amountPerTrade: number;
    maxTotalAmount: number;
}

export interface UseCopyTradingReturn {
    // State
    isLoading: boolean;
    isSigningDelegation: boolean;
    error: string | null;
    delegationStatus: DelegationStatus | null;
    copySettings: CopySettings[];

    // Actions
    checkDelegationStatus: () => Promise<DelegationStatus>;
    hasExistingSigner: (walletAddress: string) => boolean;
    enableCopyTrading: (leaderId: string, leaderName: string, settings: CopyTradingSettings) => Promise<void>;
    disableCopyTrading: (leaderId: string) => Promise<void>;
    getCopySettingsForLeader: (leaderId: string) => Promise<CopySettings | null>;
    fetchAllCopySettings: () => Promise<CopySettings[]>;
    clearError: () => void;
}

/**
 * Generate the delegation message for signing
 */
const generateDelegationMessage = (
    leaderName: string,
    leaderId: string,
    amountPerTrade: number,
    maxTotalAmount: number
): string => {
    const timestamp = new Date().toISOString();
    return `HUNCH COPY TRADING DELEGATION
I authorize Hunch to execute trades on my behalf by copying ${leaderName}.
Terms:
- Amount per trade: $${amountPerTrade}
- Maximum total allocation: $${maxTotalAmount}
- Leader ID: ${leaderId}
This authorization can be revoked at any time by disabling copy trading.
Timestamp: ${timestamp}`;
};

/**
 * Hook for managing copy trading functionality with 3-layer authentication
 * 
 * Layer 1: Session Signer - One-time setup via Privy's addSessionSigners()
 * Layer 2: Delegation Signature - One-time user signature authorizing Hunch
 * Layer 3: Copy Settings - Per-leader configuration stored in database
 */
export function useCopyTrading(): UseCopyTradingReturn {
    const { user } = usePrivy();
    const { wallets } = useEmbeddedSolanaWallet();

    const [isLoading, setIsLoading] = useState(false);
    const [isSigningDelegation, setIsSigningDelegation] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [delegationStatus, setDelegationStatus] = useState<DelegationStatus | null>(null);
    const [copySettings, setCopySettings] = useState<CopySettings[]>([]);

    const wallet = wallets?.[0];
    const { addSessionSigners } = useSessionSigners();

    /**
     * Check if wallet already has a session signer (delegated = true)
     * This prevents the "Duplicate Signer" error
     */
    const hasExistingSigner = useCallback((walletAddress: string): boolean => {
        if (!user?.linked_accounts) return false;

        const linkedWallet = user.linked_accounts.find(
            (account: any) =>
                account.type === 'wallet' &&
                'address' in account &&
                account.address?.toLowerCase() === walletAddress.toLowerCase() &&
                'delegated' in account
        );

        return (linkedWallet as any)?.delegated === true;
    }, [user]);

    /**
     * Fetch delegation status from backend
     */
    const checkDelegationStatus = useCallback(async (): Promise<DelegationStatus> => {
        try {
            const status = await api.getDelegationStatus();
            setDelegationStatus(status);
            return status;
        } catch (err: any) {
            console.error('Failed to check delegation status:', err);
            throw err;
        }
    }, []);

    /**
     * Sign delegation message with wallet
     */
    const signDelegationMessage = async (
        message: string
    ): Promise<string> => {
        if (!wallet) {
            throw new Error('No wallet available for signing');
        }

        try {
            const provider = await wallet.getProvider();
            // Sign the message using the wallet provider
            const encodedMessage = new TextEncoder().encode(message);
            // @ts-ignore - signMessage exists on Privy provider but may not be in types
            const signatureResult = await (provider as any).signMessage(encodedMessage);

            // Convert signature to base64 string
            if (signatureResult && typeof signatureResult === 'object' && 'signature' in signatureResult) {
                // Handle object with signature property
                const sigBytes = (signatureResult as any).signature;
                if (sigBytes instanceof Uint8Array) {
                    return Buffer.from(sigBytes).toString('base64');
                }
            }

            // Handle Uint8Array directly
            if (signatureResult instanceof Uint8Array) {
                return Buffer.from(signatureResult).toString('base64');
            }

            // Handle string response
            if (typeof signatureResult === 'string') {
                return signatureResult;
            }

            throw new Error('Unexpected signature format');
        } catch (err: any) {
            console.error('Failed to sign delegation message:', err);
            throw new Error(`Failed to sign message: ${err.message}`);
        }
    };

    /**
     * Add session signer to wallet (only if not already added)
     * Uses the useSessionSigners hook from @privy-io/expo
     */
    const addSessionSigner = async (): Promise<void> => {
        if (!wallet) {
            throw new Error('No wallet available');
        }

        if (!KEY_QUORUM_ID) {
            throw new Error('Key Quorum ID not configured');
        }

        const walletAddress = wallet.address;

        // Check if signer already exists to prevent duplicate error
        if (hasExistingSigner(walletAddress)) {
            console.log('[CopyTrading] Session signer already exists, skipping addSessionSigners');
            return;
        }

        try {
            // Use the useSessionSigners hook's addSessionSigners function
            // This matches the web app pattern from @privy-io/react-auth
            await addSessionSigners({
                address: walletAddress,
                signers: [{
                    signerId: KEY_QUORUM_ID,
                    policyIds: []
                }]
            });
            console.log('[CopyTrading] Session signer added successfully');
        } catch (err: any) {
            // Handle duplicate signer error gracefully
            if (err.message?.includes('Duplicate') || err.message?.includes('duplicate')) {
                console.log('[CopyTrading] Signer already exists (caught duplicate error)');
                return;
            }
            throw err;
        }
    };

    /**
     * Enable copy trading for a leader
     * Implements the fast path (already delegated) or full flow (needs signature)
     */
    const enableCopyTrading = useCallback(async (
        leaderId: string,
        leaderName: string,
        settings: CopyTradingSettings
    ): Promise<void> => {
        if (!wallet) {
            throw new Error('No wallet available');
        }

        setIsLoading(true);
        setError(null);

        try {
            // Step 1: Check delegation status
            const status = await checkDelegationStatus();
            const walletAddress = wallet.address;
            const walletHasSigner = hasExistingSigner(walletAddress);

            console.log('[CopyTrading] Status check:', {
                hasValidDelegation: status.hasValidDelegation,
                walletHasSigner,
            });

            // Step 2: Determine flow
            if (status.hasValidDelegation && walletHasSigner) {
                // FAST PATH - No signature needed, just save settings
                console.log('[CopyTrading] Fast path - saving settings directly');

                await api.createCopySettings({
                    leaderId,
                    amountPerTrade: settings.amountPerTrade,
                    maxTotalAmount: settings.maxTotalAmount,
                });
            } else {
                // FULL FLOW - Need signature
                console.log('[CopyTrading] Full flow - requesting signature');
                setIsSigningDelegation(true);

                // Generate and sign delegation message
                const message = generateDelegationMessage(
                    leaderName,
                    leaderId,
                    settings.amountPerTrade,
                    settings.maxTotalAmount
                );

                const signature = await signDelegationMessage(message);

                // Add session signer if missing
                if (!walletHasSigner) {
                    console.log('[CopyTrading] Adding session signer');
                    await addSessionSigner();
                }

                // Save with signature
                await api.createCopySettings({
                    leaderId,
                    amountPerTrade: settings.amountPerTrade,
                    maxTotalAmount: settings.maxTotalAmount,
                    delegationSignature: signature,
                    signedMessage: message,
                });

                setIsSigningDelegation(false);
            }

            // Refresh copy settings
            await fetchAllCopySettings();

            console.log('[CopyTrading] Copy trading enabled successfully');
        } catch (err: any) {
            console.error('[CopyTrading] Failed to enable copy trading:', err);
            setIsSigningDelegation(false);

            // Handle specific error codes
            if ((err as AuthError)?.code === 'DELEGATION_REQUIRED') {
                setError('Delegation signature required. Please try again.');
            } else if ((err as AuthError)?.code === 'MISSING_TOKEN') {
                setError('Authentication required. Please log in again.');
            } else if ((err as AuthError)?.code === 'INVALID_TOKEN') {
                setError('Session expired. Please log in again.');
            } else {
                setError(err.message || 'Failed to enable copy trading');
            }

            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [wallet, checkDelegationStatus, hasExistingSigner]);

    /**
     * Disable copy trading for a leader
     */
    const disableCopyTrading = useCallback(async (leaderId: string): Promise<void> => {
        setIsLoading(true);
        setError(null);

        try {
            await api.deleteCopySettings(leaderId);

            // Update local state
            setCopySettings(prev => prev.filter(s => s.leaderId !== leaderId));

            console.log('[CopyTrading] Copy trading disabled for leader:', leaderId);
        } catch (err: any) {
            console.error('[CopyTrading] Failed to disable copy trading:', err);
            setError(err.message || 'Failed to disable copy trading');
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Get copy settings for a specific leader
     */
    const getCopySettingsForLeader = useCallback(async (leaderId: string): Promise<CopySettings | null> => {
        try {
            const settings = await api.getCopySettings(leaderId);
            return settings.length > 0 ? settings[0] : null;
        } catch (err: any) {
            console.error('[CopyTrading] Failed to get copy settings:', err);
            return null;
        }
    }, []);

    /**
     * Fetch all copy settings for the current user
     */
    const fetchAllCopySettings = useCallback(async (): Promise<CopySettings[]> => {
        try {
            const settings = await api.getCopySettings();
            setCopySettings(settings);
            return settings;
        } catch (err: any) {
            console.error('[CopyTrading] Failed to fetch copy settings:', err);
            return [];
        }
    }, []);

    /**
     * Clear error state
     */
    const clearError = useCallback(() => {
        setError(null);
    }, []);

    return {
        // State
        isLoading,
        isSigningDelegation,
        error,
        delegationStatus,
        copySettings,

        // Actions
        checkDelegationStatus,
        hasExistingSigner,
        enableCopyTrading,
        disableCopyTrading,
        getCopySettingsForLeader,
        fetchAllCopySettings,
        clearError,
    };
}
