/**
 * Centralized Authentication Sync Utility
 * Handles user sync only on login and manages localStorage caching
 */

const STORAGE_KEYS = {
    USER_ID: 'hunch_user_id',
    USER_COUNTS: 'hunch_user_counts',
    USER_PROFILE: 'hunch_user_profile',
    LAST_SYNC: 'hunch_last_sync',
    PRIVY_ID: 'hunch_privy_id',
};

export interface UserCounts {
    followerCount: number;
    followingCount: number;
}

export interface CachedUserProfile {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    walletAddress: string;
    followerCount: number;
    followingCount: number;
}

/**
 * Check if user needs to be synced
 */
export function needsSync(privyId: string): boolean {
    const lastPrivyId = localStorage.getItem(STORAGE_KEYS.PRIVY_ID);
    const lastSync = localStorage.getItem(STORAGE_KEYS.LAST_SYNC);

    // Need sync if different user or never synced
    if (lastPrivyId !== privyId || !lastSync) {
        return true;
    }

    // Need sync if last sync was more than 1 hour ago
    const lastSyncTime = parseInt(lastSync, 10);
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    return lastSyncTime < oneHourAgo;
}

/**
 * Get cached user ID
 */
export function getCachedUserId(): string | null {
    return localStorage.getItem(STORAGE_KEYS.USER_ID);
}

/**
 * Get cached user counts
 */
export function getCachedUserCounts(): UserCounts | null {
    const cached = localStorage.getItem(STORAGE_KEYS.USER_COUNTS);
    if (!cached) return null;

    try {
        return JSON.parse(cached);
    } catch {
        return null;
    }
}

/**
 * Get cached user profile
 */
export function getCachedUserProfile(): CachedUserProfile | null {
    const cached = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
    if (!cached) return null;

    try {
        return JSON.parse(cached);
    } catch {
        return null;
    }
}

/**
 * Cache user data
 */
export function cacheUserData(userId: string, counts: UserCounts, profile?: Partial<CachedUserProfile>, privyId?: string) {
    localStorage.setItem(STORAGE_KEYS.USER_ID, userId);
    localStorage.setItem(STORAGE_KEYS.USER_COUNTS, JSON.stringify(counts));
    localStorage.setItem(STORAGE_KEYS.LAST_SYNC, Date.now().toString());

    if (privyId) {
        localStorage.setItem(STORAGE_KEYS.PRIVY_ID, privyId);
    }

    if (profile) {
        const existingProfile = getCachedUserProfile();
        const updatedProfile = {
            ...existingProfile,
            ...profile,
            id: userId,
            followerCount: counts.followerCount,
            followingCount: counts.followingCount,
        };
        localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(updatedProfile));
    }
}

/**
 * Update cached counts (for optimistic updates)
 */
export function updateCachedCounts(counts: Partial<UserCounts>) {
    const existing = getCachedUserCounts();
    if (!existing) return;

    const updated = {
        ...existing,
        ...counts,
    };

    localStorage.setItem(STORAGE_KEYS.USER_COUNTS, JSON.stringify(updated));

    // Also update the profile cache
    const profile = getCachedUserProfile();
    if (profile) {
        const updatedProfile = {
            ...profile,
            followerCount: updated.followerCount,
            followingCount: updated.followingCount,
        };
        localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(updatedProfile));
    }
}

/**
 * Sync user with backend (call this only on login)
 */
export async function syncUserOnLogin(
    privyId: string,
    walletAddress: string,
    displayName?: string | null,
    avatarUrl?: string | null
): Promise<{ userId: string; counts: UserCounts } | null> {
    try {
        const syncResponse = await fetch('/api/users/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                privyId,
                walletAddress,
                displayName,
                avatarUrl,
            }),
        });

        if (syncResponse.ok) {
            const syncedUser = await syncResponse.json();
            const counts: UserCounts = {
                followerCount: syncedUser.followerCount || 0,
                followingCount: syncedUser.followingCount || 0,
            };

            // Cache the synced data
            cacheUserData(
                syncedUser.id,
                counts,
                {
                    id: syncedUser.id,
                    displayName: syncedUser.displayName,
                    avatarUrl: syncedUser.avatarUrl,
                    walletAddress: syncedUser.walletAddress,
                    followerCount: counts.followerCount,
                    followingCount: counts.followingCount,
                },
                privyId
            );

            return {
                userId: syncedUser.id,
                counts,
            };
        }

        return null;
    } catch (error) {
        console.error('Error syncing user:', error);
        return null;
    }
}

/**
 * Fetch fresh user counts without syncing
 */
export async function fetchUserCounts(userId: string): Promise<UserCounts | null> {
    try {
        const response = await fetch(`/api/users/${userId}`, {
            cache: 'no-store',
        });

        if (response.ok) {
            const user = await response.json();
            const counts: UserCounts = {
                followerCount: user.followerCount || 0,
                followingCount: user.followingCount || 0,
            };

            // Update cache
            updateCachedCounts(counts);

            return counts;
        }

        return null;
    } catch (error) {
        console.error('Error fetching user counts:', error);
        return null;
    }
}

/**
 * Clear all cached auth data (call on logout)
 */
export function clearAuthCache() {
    Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
    });
}
