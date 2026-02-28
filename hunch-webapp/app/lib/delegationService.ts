/**
 * Delegation Service — DEPRECATED
 * 
 * The delegation model has been replaced with per-user Polymarket CLOB API credentials.
 * Users' Privy embedded wallets sign orders directly.
 * 
 * This file is kept for backwards compatibility with copy trading flows
 * but the User.delegationSignature fields have been removed.
 * Copy trading delegation is now handled through CopySettings.delegationSignature.
 */

import { prisma } from './db';

export interface DelegationData {
    hasValidDelegation: boolean;
    hasClobCredentials: boolean;
}

/**
 * Check if a user has CLOB credentials set up (replaces old delegation check)
 */
export async function hasValidDelegation(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            clobApiKey: true,
        },
    });

    return !!user?.clobApiKey;
}

/**
 * Get the delegation/CLOB status for a user
 */
export async function getDelegation(userId: string): Promise<DelegationData> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            clobApiKey: true,
        },
    });

    const hasClobCredentials = !!user?.clobApiKey;

    return {
        hasValidDelegation: hasClobCredentials,
        hasClobCredentials,
    };
}

/**
 * Validate that a user can execute copy trades
 * (requires CLOB credentials to be set up)
 */
export async function validateDelegationForCopyTrade(
    followerId: string
): Promise<{ valid: boolean; reason?: string }> {
    const delegation = await getDelegation(followerId);

    if (!delegation.hasClobCredentials) {
        return {
            valid: false,
            reason: 'NO_CLOB_CREDENTIALS',
        };
    }

    return { valid: true };
}
