'use client';

import { useState, useEffect } from 'react';
import { usePrivy, useSessionSigners } from '@privy-io/react-auth';
import { useWallets, useSignMessage } from '@privy-io/react-auth/solana';
import bs58 from 'bs58';

interface CopySettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    followerId: string;
    leaderId: string;
    leaderName: string;
    onSave?: () => void;
}

interface CopySettingsData {
    id: string;
    amountPerTrade: number;
    maxTotalAmount: number;
    usedAmount: number;
    enabled: boolean;
    expiresAt: string | null;
    delegationSignature: string | null;
}

export default function CopySettingsModal({
    isOpen,
    onClose,
    followerId,
    leaderId,
    leaderName,
    onSave,
}: CopySettingsModalProps) {
    const { user } = usePrivy();
    const { wallets } = useWallets();
    const { signMessage } = useSignMessage();
    const { addSessionSigners, removeSessionSigners } = useSessionSigners();
    const [amountPerTrade, setAmountPerTrade] = useState<string>('');
    const [maxTotalAmount, setMaxTotalAmount] = useState<string>('');
    const [enabled, setEnabled] = useState(true);
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(false);
    const [existingSettings, setExistingSettings] = useState<CopySettingsData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [hasDelegation, setHasDelegation] = useState(false);

    /**
     * Check if the wallet already has a delegated signer added.
     * Privy wallets with signers have `delegated: true` in linkedAccounts.
     */
    const hasExistingSigner = (walletAddress: string): boolean => {
        if (!user?.linkedAccounts) return false;

        const walletAccount = user.linkedAccounts.find(
            (account): account is any =>
                account.type === 'wallet' &&
                'address' in account &&
                account.address === walletAddress &&
                'delegated' in account
        );

        return walletAccount?.delegated === true;
    };

    useEffect(() => {
        if (isOpen && followerId && leaderId) {
            fetchExistingSettings();
            setShowConfirmation(false);
        }
    }, [isOpen, followerId, leaderId]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    const fetchExistingSettings = async () => {
        setFetching(true);
        try {
            // Fetch copy settings and delegation status in parallel
            const [settingsResponse, delegationResponse] = await Promise.all([
                fetch(`/api/copy-settings?leaderId=${leaderId}`),
                fetch(`/api/users/delegation-status`),
            ]);

            if (settingsResponse.ok) {
                const data = await settingsResponse.json();
                if (data) {
                    setExistingSettings(data);
                    setAmountPerTrade(data.amountPerTrade.toString());
                    setMaxTotalAmount(data.maxTotalAmount.toString());
                    setEnabled(data.enabled);
                }
            }

            // Check if user already has a delegation on file
            if (delegationResponse.ok) {
                const delegationData = await delegationResponse.json();
                setHasDelegation(delegationData.hasValidDelegation === true);
            }
        } catch (error) {
            console.error('Error fetching copy settings:', error);
        } finally {
            setFetching(false);
        }
    };


    const handleSaveClick = () => {
        setError(null);
        const amountNum = parseFloat(amountPerTrade);
        const maxNum = parseFloat(maxTotalAmount);

        if (isNaN(amountNum) || amountNum <= 0) {
            setError('Enter valid amount per trade');
            return;
        }
        if (isNaN(maxNum) || maxNum <= 0) {
            setError('Enter valid total cap');
            return;
        }
        if (amountNum > maxNum) {
            setError('Amount cannot exceed cap');
            return;
        }

        // Check if user already has delegation on file
        // If yes, we can skip the signature confirmation and save directly
        const selectedWallet = wallets[0];
        const walletHasSigner = selectedWallet && hasExistingSigner(selectedWallet.address);

        if (hasDelegation && walletHasSigner) {
            // Fast path: User already authorized, save settings directly
            console.log('User has existing delegation and signer, saving directly...');
            handleSaveWithoutSignature();
        } else {
            // Show confirmation screen for signature
            setShowConfirmation(true);
        }
    };

    /**
     * Save copy settings without requiring a new signature.
     * Used when user already has delegation on file.
     */
    const handleSaveWithoutSignature = async () => {
        const amountNum = parseFloat(amountPerTrade);
        const maxNum = parseFloat(maxTotalAmount);

        setLoading(true);
        setError(null);

        try {
            // Get the wallet for signer check
            const selectedWallet = wallets[0];
            if (!selectedWallet?.address) {
                throw new Error('No wallet found. Please connect your wallet.');
            }

            // Ensure signer is added (belt and suspenders)
            const alreadyHasSigner = hasExistingSigner(selectedWallet.address);
            if (!alreadyHasSigner) {
                console.log('Adding signer since not found on wallet...');
                try {
                    await addSessionSigners({
                        address: selectedWallet.address,
                        signers: [{
                            signerId: process.env.NEXT_PUBLIC_KEY_QUORUM_ID!,
                            policyIds: []
                        }]
                    });
                } catch (signerError: any) {
                    if (!signerError.message?.toLowerCase().includes('duplicate')) {
                        throw new Error(`Failed to authorize server: ${signerError.message}`);
                    }
                }
            }

            // Save settings WITHOUT new signature
            const response = await fetch('/api/copy-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leaderId,
                    amountPerTrade: amountNum,
                    maxTotalAmount: maxNum,
                    // No delegationSignature needed - already on file
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save');
            }

            console.log('Settings saved successfully (fast path)');
            onSave?.();
            onClose();
        } catch (error: any) {
            console.error('Save error:', error);
            setError(error.message || 'Failed to save settings');
        } finally {
            setLoading(false);
        }
    };


    const handleConfirmAndSign = async () => {
        const amountNum = parseFloat(amountPerTrade);
        const maxNum = parseFloat(maxTotalAmount);

        setLoading(true);
        setError(null);

        try {
            console.log('Starting signature process...');

            // Get the first wallet
            const selectedWallet = wallets[0];
            if (!selectedWallet) {
                throw new Error('No wallet found. Please connect your wallet.');
            }

            // Create the delegation message
            const timestamp = new Date().toISOString();
            const message = `HUNCH COPY TRADING DELEGATION

I authorize Hunch to execute trades on my behalf by copying ${leaderName}.

Terms:
• Amount per trade: $${amountNum.toFixed(2)}
• Maximum total allocation: $${maxNum.toFixed(2)}
• Leader ID: ${leaderId}

This authorization can be revoked at any time by disabling copy trading.

Timestamp: ${timestamp}
Follower ID: ${followerId}`;

            console.log('Requesting signature from wallet...');

            // Request wallet signature using Privy's useSignMessage
            const signatureUint8Array = (
                await signMessage({
                    message: new TextEncoder().encode(message),
                    wallet: selectedWallet,
                    options: {
                        uiOptions: {
                            title: 'Sign Copy Trading Delegation',
                            description: `Authorize Hunch to copy ${leaderName}'s trades`
                        }
                    }
                })
            ).signature;

            // Convert signature to base58 string for storage
            const signature = bs58.encode(signatureUint8Array);

            console.log('Signature obtained, adding server as signer...');

            // Use the selected wallet address (already validated above)
            // The selectedWallet is the Solana wallet from useWallets hook
            const walletAddress = selectedWallet.address;

            if (!walletAddress) {
                throw new Error('Wallet address not found');
            }

            console.log(`Adding signer for wallet: ${walletAddress}`);

            // Check if wallet already has a delegated signer
            // This prevents "Duplicate Signer" errors when copying multiple leaders
            const alreadyHasSigner = hasExistingSigner(walletAddress);

            if (alreadyHasSigner) {
                console.log('Wallet already has signer, skipping addSessionSigners');
            } else {
                // Add server's key quorum as a signer to user's wallet
                // This enables server-side transaction signing for copy trading
                try {
                    await addSessionSigners({
                        address: walletAddress,
                        signers: [{
                            signerId: process.env.NEXT_PUBLIC_KEY_QUORUM_ID!,
                            policyIds: [] // Full permissions (no restrictions)
                        }]
                    });
                    console.log('Server added as signer successfully');
                } catch (signerError: any) {
                    // Check if this is a duplicate signer error - if so, continue
                    if (signerError.message?.toLowerCase().includes('duplicate')) {
                        console.log('Signer already exists (caught duplicate error), continuing...');
                    } else {
                        console.error('Failed to add signer:', signerError);
                        throw new Error(`Failed to authorize server: ${signerError.message}`);
                    }
                }
            }

            console.log('Saving settings to database...');

            // Save settings with signature
            const response = await fetch('/api/copy-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leaderId,
                    amountPerTrade: amountNum,
                    maxTotalAmount: maxNum,
                    delegationSignature: signature,
                    signedMessage: message,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save');
            }

            console.log('Settings saved successfully');
            onSave?.();
            onClose();
        } catch (error: any) {
            console.error('Signing error:', error);
            setError(error.message || 'Failed to sign delegation');
            setShowConfirmation(false);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!existingSettings) return;
        setLoading(true);
        setError(null);
        try {
            // Get the wallet address to remove signer
            const selectedWallet = wallets[0];
            if (selectedWallet?.address) {
                console.log('Removing server as signer...');
                try {
                    // Remove all session signers from the wallet
                    // This revokes the server's permission to sign transactions
                    await removeSessionSigners({
                        address: selectedWallet.address
                    });
                    console.log('Server signer removed successfully');
                } catch (signerError: any) {
                    console.error('Failed to remove signer:', signerError);
                    // Continue with deletion even if signer removal fails
                    // The user might have already removed it manually
                }
            }

            // Delete copy settings from database
            await fetch('/api/copy-settings', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ followerId, leaderId }),
            });
            onSave?.();
            onClose();
        } catch (error: any) {
            console.error('Delete error:', error);
            setError(error.message || 'Failed to delete');
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = async () => {
        if (!existingSettings) return;
        setLoading(true);
        try {
            const response = await fetch(`/api/copy-settings/${followerId}/${leaderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'toggle' }),
            });
            if (response.ok) {
                const data = await response.json();
                setEnabled(data.enabled);
                setExistingSettings(data);
            }
        } catch (error: any) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const usedPct = existingSettings
        ? Math.min((existingSettings.usedAmount / existingSettings.maxTotalAmount) * 100, 100)
        : 0;

    const amountNum = parseFloat(amountPerTrade) || 0;
    const maxNum = parseFloat(maxTotalAmount) || 0;

    // Confirmation screen
    if (showConfirmation) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <div className="bg-[var(--card-bg)] rounded-xl w-full max-w-sm border border-[var(--border-color)] shadow-2xl">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
                        <div>
                            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Confirm Delegation</h2>
                            <p className="text-xs text-[var(--text-tertiary)]">Sign to authorize</p>
                        </div>
                        <button
                            onClick={() => setShowConfirmation(false)}
                            className="p-1.5 hover:bg-[var(--surface-hover)] rounded-lg transition-colors"
                        >
                            <svg className="w-4 h-4 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-4 space-y-4">
                        <div className="p-3 bg-[var(--surface-hover)] rounded-lg border border-[var(--border-color)]">
                            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                <span className="font-semibold text-[var(--text-primary)]">Hunch</span> will execute trades on your behalf by copying <span className="font-semibold text-[var(--text-primary)]">{leaderName}</span>.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-[var(--text-tertiary)]">Per Trade</span>
                                <span className="text-[var(--text-primary)] font-mono">${amountNum.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-[var(--text-tertiary)]">Max Total</span>
                                <span className="text-[var(--text-primary)] font-mono">${maxNum.toFixed(2)}</span>
                            </div>
                        </div>

                        <p className="text-xs text-[var(--text-tertiary)] text-center">
                            You can revoke this at any time by disabling copy trading.
                        </p>

                        {error && (
                            <p className="text-xs text-red-400 text-center">{error}</p>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--border-color)]">
                        <button
                            onClick={() => setShowConfirmation(false)}
                            className="flex-1 px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)] rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirmAndSign}
                            disabled={loading}
                            className="flex-1 px-4 py-2 text-xs font-medium text-[var(--card-bg)] bg-[var(--text-primary)] hover:opacity-90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <span className="w-3 h-3 border-2 border-[var(--card-bg)]/30 border-t-[var(--card-bg)] rounded-full animate-spin" />
                                    Signing...
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                    Sign & Enable
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-[var(--card-bg)] rounded-xl w-full max-w-sm border border-[var(--border-color)] shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
                    <div>
                        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Copy Trading</h2>
                        <p className="text-xs text-[var(--text-tertiary)]">{leaderName}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-[var(--surface-hover)] rounded-lg transition-colors"
                    >
                        <svg className="w-4 h-4 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    {fetching ? (
                        <div className="flex justify-center py-6">
                            <div className="w-5 h-5 border-2 border-[var(--text-tertiary)] border-t-[var(--text-primary)] rounded-full animate-spin" />
                        </div>
                    ) : (
                        <>
                            {/* Status toggle for existing settings */}
                            {existingSettings && (
                                <div className="flex items-center justify-between p-3 bg-[var(--surface-hover)] rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${enabled ? 'bg-green-500' : 'bg-[var(--text-tertiary)]'}`} />
                                        <span className="text-xs text-[var(--text-secondary)]">
                                            {enabled ? 'Active' : 'Paused'}
                                            {existingSettings.delegationSignature && (
                                                <span className="ml-1 text-[var(--text-tertiary)]">• Signed</span>
                                            )}
                                        </span>
                                    </div>
                                    <button
                                        onClick={handleToggle}
                                        disabled={loading}
                                        className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-[var(--text-primary)]' : 'bg-[var(--border-color)]'}`}
                                    >
                                        <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${enabled ? 'left-5 bg-[var(--card-bg)]' : 'left-0.5 bg-[var(--text-tertiary)]'}`} />
                                    </button>
                                </div>
                            )}

                            {/* Budget bar for existing settings */}
                            {existingSettings && (
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-[var(--text-tertiary)]">Budget</span>
                                        <span className="text-[var(--text-secondary)] font-mono">
                                            ${existingSettings.usedAmount.toFixed(0)} / ${existingSettings.maxTotalAmount.toFixed(0)}
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-[var(--surface-hover)] rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-[var(--text-secondary)] rounded-full transition-all"
                                            style={{ width: `${usedPct}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Amount inputs */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-[var(--text-tertiary)] mb-1.5">Per Trade</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-sm">$</span>
                                        <input
                                            type="number"
                                            value={amountPerTrade}
                                            onChange={(e) => setAmountPerTrade(e.target.value)}
                                            placeholder="10"
                                            className="w-full pl-7 pr-3 py-2 bg-[var(--surface-hover)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--text-secondary)] transition-colors"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-[var(--text-tertiary)] mb-1.5">Total Cap</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-sm">$</span>
                                        <input
                                            type="number"
                                            value={maxTotalAmount}
                                            onChange={(e) => setMaxTotalAmount(e.target.value)}
                                            placeholder="100"
                                            className="w-full pl-7 pr-3 py-2 bg-[var(--surface-hover)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--text-secondary)] transition-colors"
                                        />
                                    </div>
                                </div>
                            </div>

                            {error && (
                                <p className="text-xs text-red-400">{error}</p>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--border-color)]">
                    {existingSettings && (
                        <button
                            onClick={handleDelete}
                            disabled={loading}
                            className="text-xs text-[var(--text-tertiary)] hover:text-red-400 transition-colors disabled:opacity-50"
                        >
                            Remove
                        </button>
                    )}
                    <div className="flex-1" />
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSaveClick}
                        disabled={loading || fetching}
                        className="px-4 py-1.5 text-xs font-medium text-[var(--card-bg)] bg-[var(--text-primary)] hover:opacity-90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 border-2 border-[var(--card-bg)]/30 border-t-[var(--card-bg)] rounded-full animate-spin" />
                            </span>
                        ) : existingSettings ? 'Update' : 'Continue'}
                    </button>
                </div>
            </div>
        </div>
    );
}
