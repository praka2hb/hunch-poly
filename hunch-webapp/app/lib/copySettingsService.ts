import { prisma } from './db';

export interface CopySettingsData {
    id: string;
    followerId: string;
    leaderId: string;
    amountPerTrade: number;
    maxTotalAmount: number;
    usedAmount: number;
    enabled: boolean;
    expiresAt: Date | null;
    delegationSignature: string | null;
    signedMessage: string | null;
    signedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    follower?: {
        id: string;
        displayName: string | null;
        avatarUrl: string | null;
        walletAddress: string;
    };
    leader?: {
        id: string;
        displayName: string | null;
        avatarUrl: string | null;
        walletAddress: string;
    };
}

export interface CreateCopySettingsInput {
    followerId: string;
    leaderId: string;
    amountPerTrade: number;
    maxTotalAmount: number;
    expiresAt?: Date | null;
    delegationSignature?: string | null;
    signedMessage?: string | null;
    signedAt?: Date | null;
}

export interface UpdateCopySettingsInput {
    amountPerTrade?: number;
    maxTotalAmount?: number;
    enabled?: boolean;
    expiresAt?: Date | null;
}

/**
 * Create or update copy settings for a follower-leader pair
 * Uses upsert to ensure only one config per pair
 */
export async function createOrUpdateCopySettings(
    followerId: string,
    leaderId: string,
    settings: CreateCopySettingsInput
): Promise<CopySettingsData> {
    // Prevent self-copy
    if (followerId === leaderId) {
        throw new Error('Cannot copy yourself');
    }

    // Verify both users exist
    const [follower, leader] = await Promise.all([
        prisma.user.findUnique({ where: { id: followerId } }),
        prisma.user.findUnique({ where: { id: leaderId } }),
    ]);

    if (!follower) {
        throw new Error(`Follower user with id ${followerId} not found`);
    }
    if (!leader) {
        throw new Error(`Leader user with id ${leaderId} not found`);
    }

    const copySettings = await prisma.copySettings.upsert({
        where: {
            followerId_leaderId: {
                followerId,
                leaderId,
            },
        },
        create: {
            followerId,
            leaderId,
            amountPerTrade: settings.amountPerTrade,
            maxTotalAmount: settings.maxTotalAmount,
            expiresAt: settings.expiresAt || null,
            delegationSignature: settings.delegationSignature || null,
            signedMessage: settings.signedMessage || null,
            signedAt: settings.signedAt || null,
            enabled: true,
            usedAmount: 0,
        },
        update: {
            amountPerTrade: settings.amountPerTrade,
            maxTotalAmount: settings.maxTotalAmount,
            expiresAt: settings.expiresAt || null,
            delegationSignature: settings.delegationSignature || null,
            signedMessage: settings.signedMessage || null,
            signedAt: settings.signedAt || null,
            enabled: true,
        },
        include: {
            follower: {
                select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true,
                    walletAddress: true,
                },
            },
            leader: {
                select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true,
                    walletAddress: true,
                },
            },
        },
    });

    console.log(`Copy settings upserted: ${followerId} -> ${leaderId}`);
    return copySettings;
}

/**
 * Get copy settings for a specific follower-leader pair
 */
export async function getCopySettings(
    followerId: string,
    leaderId: string
): Promise<CopySettingsData | null> {
    return prisma.copySettings.findUnique({
        where: {
            followerId_leaderId: {
                followerId,
                leaderId,
            },
        },
        include: {
            follower: {
                select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true,
                    walletAddress: true,
                },
            },
            leader: {
                select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true,
                    walletAddress: true,
                },
            },
        },
    });
}

/**
 * Get all copy settings for a follower (all leaders they are copying)
 */
export async function getCopySettingsForFollower(
    followerId: string
): Promise<CopySettingsData[]> {
    return prisma.copySettings.findMany({
        where: { followerId },
        include: {
            leader: {
                select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true,
                    walletAddress: true,
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    });
}

/**
 * Get all copy settings for a leader (all followers copying them)
 */
export async function getCopySettingsForLeader(
    leaderId: string
): Promise<CopySettingsData[]> {
    return prisma.copySettings.findMany({
        where: { leaderId },
        include: {
            follower: {
                select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true,
                    walletAddress: true,
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    });
}

/**
 * Update copy settings
 */
export async function updateCopySettings(
    followerId: string,
    leaderId: string,
    updates: UpdateCopySettingsInput
): Promise<CopySettingsData> {
    const copySettings = await prisma.copySettings.update({
        where: {
            followerId_leaderId: {
                followerId,
                leaderId,
            },
        },
        data: updates,
        include: {
            follower: {
                select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true,
                    walletAddress: true,
                },
            },
            leader: {
                select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true,
                    walletAddress: true,
                },
            },
        },
    });

    console.log(`Copy settings updated: ${followerId} -> ${leaderId}`);
    return copySettings;
}

/**
 * Toggle copy enabled status
 */
export async function toggleCopyEnabled(
    followerId: string,
    leaderId: string
): Promise<CopySettingsData> {
    const existing = await prisma.copySettings.findUnique({
        where: {
            followerId_leaderId: {
                followerId,
                leaderId,
            },
        },
    });

    if (!existing) {
        throw new Error('Copy settings not found');
    }

    return prisma.copySettings.update({
        where: {
            followerId_leaderId: {
                followerId,
                leaderId,
            },
        },
        data: {
            enabled: !existing.enabled,
        },
        include: {
            follower: {
                select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true,
                    walletAddress: true,
                },
            },
            leader: {
                select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true,
                    walletAddress: true,
                },
            },
        },
    });
}

/**
 * Delete copy settings
 */
export async function deleteCopySettings(
    followerId: string,
    leaderId: string
): Promise<{ success: boolean }> {
    await prisma.copySettings.delete({
        where: {
            followerId_leaderId: {
                followerId,
                leaderId,
            },
        },
    });

    console.log(`Copy settings deleted: ${followerId} -> ${leaderId}`);
    return { success: true };
}

/**
 * Update used amount (for tracking how much has been spent)
 */
export async function updateUsedAmount(
    followerId: string,
    leaderId: string,
    additionalAmount: number
): Promise<CopySettingsData> {
    const copySettings = await prisma.copySettings.update({
        where: {
            followerId_leaderId: {
                followerId,
                leaderId,
            },
        },
        data: {
            usedAmount: {
                increment: additionalAmount,
            },
        },
    });

    console.log(`Copy settings used amount updated: ${followerId} -> ${leaderId}, added: ${additionalAmount}`);
    return copySettings;
}

/**
 * Check if copy trading is enabled and has remaining budget
 */
export async function canCopyTrade(
    followerId: string,
    leaderId: string,
    tradeAmount: number
): Promise<{ canCopy: boolean; reason?: string }> {
    const settings = await getCopySettings(followerId, leaderId);

    if (!settings) {
        return { canCopy: false, reason: 'No copy settings configured' };
    }

    if (!settings.enabled) {
        return { canCopy: false, reason: 'Copy trading is disabled' };
    }

    if (settings.expiresAt && new Date() > settings.expiresAt) {
        return { canCopy: false, reason: 'Copy settings have expired' };
    }

    const remainingBudget = settings.maxTotalAmount - settings.usedAmount;
    if (tradeAmount > remainingBudget) {
        return { canCopy: false, reason: `Insufficient budget. Remaining: ${remainingBudget}` };
    }

    return { canCopy: true };
}

/**
 * Get all ACTIVE copy settings for a leader
 * Used for fan-out when a leader places a trade
 * Only returns enabled settings that are not expired
 */
export async function getActiveCopySettingsForLeader(
    leaderId: string
): Promise<CopySettingsData[]> {
    return prisma.copySettings.findMany({
        where: {
            leaderId,
            enabled: true,
            OR: [
                { expiresAt: null },
                { expiresAt: { gt: new Date() } }
            ]
        },
        include: {
            follower: {
                select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true,
                    walletAddress: true,
                },
            },
        },
    });
}

