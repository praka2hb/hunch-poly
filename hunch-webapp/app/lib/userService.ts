import { prisma } from './db';
import redis, { CacheKeys, CacheTTL } from './redis';

export interface CreateUserData {
  privyId: string;
  walletAddress: string;
  displayName?: string;
  avatarUrl?: string;
  preferences?: string[];
}

export interface UserProfile {
  id: string;
  privyId: string;
  walletAddress: string;
  displayName: string | null;
  avatarUrl: string | null;
  preferences: string[];
  followerCount: number;
  followingCount: number;
  createdAt: Date;
  updatedAt: Date;
  username: string | null;
  normalizedUsername: string | null;
  onboardingStep: string;
  hasCompletedOnboarding: boolean;
  walletReady: boolean;
  hasLinkedX: boolean;
  authProvider: string | null;
  _count?: {
    trades: number;
  };
}

/**
 * Sync or create a user from Privy auth data
 */
export async function syncUser(data: CreateUserData): Promise<UserProfile> {
  // Try to find existing user by privyId or walletAddress
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { privyId: data.privyId },
        { walletAddress: data.walletAddress },
      ],
    },
  });

  if (existingUser) {
    // Update user if data has changed
    const updatedUser = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        privyId: data.privyId,
        walletAddress: data.walletAddress,
        displayName: data.displayName ?? existingUser.displayName,
        avatarUrl: data.avatarUrl ?? existingUser.avatarUrl,
        preferences: data.preferences ?? existingUser.preferences,
      },
      select: {
        id: true,
        privyId: true,
        walletAddress: true,
        displayName: true,
        avatarUrl: true,
        preferences: true,
        followerCount: true,
        followingCount: true,
        createdAt: true,
        updatedAt: true,
        username: true,
        normalizedUsername: true,
        onboardingStep: true,
        hasCompletedOnboarding: true,
        walletReady: true,
        hasLinkedX: true,
        authProvider: true,
        _count: {
          select: {
            trades: true,
          },
        },
      },
    });

    // Cache the counts immediately so they're available on profile load
    const counts = {
      followerCount: updatedUser.followerCount,
      followingCount: updatedUser.followingCount,
    };
    await redis.setex(
      CacheKeys.counts(updatedUser.id),
      CacheTTL.COUNTS,
      JSON.stringify(counts)
    );

    // Cache the full user profile
    await redis.setex(
      CacheKeys.user(updatedUser.id),
      CacheTTL.USER,
      JSON.stringify(updatedUser)
    );

    console.log('syncUser returning:', {
      id: updatedUser.id,
      followerCount: updatedUser.followerCount,
      followingCount: updatedUser.followingCount,
    });

    return updatedUser as UserProfile;
  }

  // Create new user
  const newUser = await prisma.user.create({
    data: {
      privyId: data.privyId,
      walletAddress: data.walletAddress,
      displayName: data.displayName,
      avatarUrl: data.avatarUrl,
      preferences: data.preferences ?? [],
    },
    select: {
      id: true,
      privyId: true,
      walletAddress: true,
      displayName: true,
      avatarUrl: true,
      preferences: true,
      followerCount: true,
      followingCount: true,
      createdAt: true,
      updatedAt: true,
      username: true,
      normalizedUsername: true,
      onboardingStep: true,
      hasCompletedOnboarding: true,
      walletReady: true,
      hasLinkedX: true,
      authProvider: true,
      _count: {
        select: {
          trades: true,
        },
      },
    },
  });

  // Cache the counts immediately (new users start with 0)
  const counts = {
    followerCount: newUser.followerCount,
    followingCount: newUser.followingCount,
  };
  await redis.setex(
    CacheKeys.counts(newUser.id),
    CacheTTL.COUNTS,
    JSON.stringify(counts)
  );

  // Cache the full user profile
  await redis.setex(
    CacheKeys.user(newUser.id),
    CacheTTL.USER,
    JSON.stringify(newUser)
  );

  return newUser as UserProfile;
}

/**
 * Get user by ID with caching
 */
export async function getUserById(userId: string, skipCache: boolean = false): Promise<UserProfile | null> {
  // Try cache first (unless skipCache is true)
  if (!skipCache) {
    const cached = await redis.get<UserProfile>(CacheKeys.user(userId));
    if (cached) {
      return cached;
    }
  }

  // Fetch from database (counts are denormalized in User model)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      privyId: true,
      walletAddress: true,
      displayName: true,
      avatarUrl: true,
      preferences: true,
      followerCount: true,
      followingCount: true,
      createdAt: true,
      updatedAt: true,
      username: true,
      normalizedUsername: true,
      onboardingStep: true,
      hasCompletedOnboarding: true,
      walletReady: true,
      hasLinkedX: true,
      authProvider: true,
      _count: {
        select: {
          trades: true,
        },
      },
    },
  });

  if (user) {
    console.log('getUserById returning:', {
      id: user.id,
      followerCount: user.followerCount,
      followingCount: user.followingCount,
      skipCache,
    });

    // Cache the counts separately for quick access
    const counts = {
      followerCount: user.followerCount,
      followingCount: user.followingCount,
    };
    await Promise.all([
      // Cache user profile
      redis.setex(
        CacheKeys.user(userId),
        CacheTTL.USER,
        JSON.stringify(user)
      ),
      // Cache counts separately
      redis.setex(
        CacheKeys.counts(userId),
        CacheTTL.COUNTS,
        JSON.stringify(counts)
      ),
    ]);
  }

  return user as UserProfile | null;
}

/**
 * Get follower/following counts with caching
 */
export async function getUserCounts(userId: string): Promise<{ followerCount: number; followingCount: number }> {
  // Try count cache first
  const cachedCounts = await redis.get<{ followerCount: number; followingCount: number }>(
    CacheKeys.counts(userId)
  );
  if (cachedCounts) {
    return cachedCounts;
  }

  // Fetch from database (counts are denormalized)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      followerCount: true,
      followingCount: true,
    },
  });

  if (!user) {
    return { followerCount: 0, followingCount: 0 };
  }

  const counts = {
    followerCount: user.followerCount || 0,
    followingCount: user.followingCount || 0,

  };

  // Cache counts
  await redis.setex(
    CacheKeys.counts(userId),
    CacheTTL.COUNTS,
    JSON.stringify(counts)
  );

  return counts;
}

/**
 * Get user by Privy ID
 */
export async function getUserByPrivyId(privyId: string): Promise<UserProfile | null> {
  const user = await prisma.user.findUnique({
    where: { privyId },
    select: {
      id: true,
      privyId: true,
      walletAddress: true,
      displayName: true,
      avatarUrl: true,
      preferences: true,
      followerCount: true,
      followingCount: true,
      createdAt: true,
      updatedAt: true,
      username: true,
      normalizedUsername: true,
      onboardingStep: true,
      hasCompletedOnboarding: true,
      walletReady: true,
      hasLinkedX: true,
      authProvider: true,
      _count: {
        select: {
          trades: true,
        },
      },
    },
  });

  if (user) {
    // Cache the counts separately for quick access
    const counts = {
      followerCount: user.followerCount,
      followingCount: user.followingCount,
    };
    await Promise.all([
      // Cache user profile
      redis.setex(
        CacheKeys.user(user.id),
        CacheTTL.USER,
        JSON.stringify(user)
      ),
      // Cache counts separately
      redis.setex(
        CacheKeys.counts(user.id),
        CacheTTL.COUNTS,
        JSON.stringify(counts)
      ),
    ]);
  }

  return user as UserProfile | null;
}

/**
 * Get user by wallet address
 */
export async function getUserByWalletAddress(walletAddress: string): Promise<UserProfile | null> {
  const user = await prisma.user.findUnique({
    where: { walletAddress },
    select: {
      id: true,
      privyId: true,
      walletAddress: true,
      displayName: true,
      avatarUrl: true,
      preferences: true,
      followerCount: true,
      followingCount: true,
      createdAt: true,
      updatedAt: true,
      username: true,
      normalizedUsername: true,
      onboardingStep: true,
      hasCompletedOnboarding: true,
      walletReady: true,
      hasLinkedX: true,
      authProvider: true,
      _count: {
        select: {
          trades: true,
        },
      },
    },
  });

  if (user) {
    // Cache the counts separately for quick access
    const counts = {
      followerCount: user.followerCount,
      followingCount: user.followingCount,
    };
    await Promise.all([
      // Cache user profile
      redis.setex(
        CacheKeys.user(user.id),
        CacheTTL.USER,
        JSON.stringify(user)
      ),
      // Cache counts separately
      redis.setex(
        CacheKeys.counts(user.id),
        CacheTTL.COUNTS,
        JSON.stringify(counts)
      ),
    ]);
  }

  return user as UserProfile | null;
}

/**
 * Get user by display name (username) - exact match
 */
export async function getUserByDisplayName(displayName: string): Promise<UserProfile | null> {
  const user = await prisma.user.findFirst({
    where: {
      displayName: {
        equals: displayName,
        mode: 'insensitive'
      }
    },
    select: {
      id: true,
      privyId: true,
      walletAddress: true,
      displayName: true,
      avatarUrl: true,
      preferences: true,
      followerCount: true,
      followingCount: true,
      createdAt: true,
      updatedAt: true,
      username: true,
      normalizedUsername: true,
      onboardingStep: true,
      hasCompletedOnboarding: true,
      walletReady: true,
      hasLinkedX: true,
      authProvider: true,
      _count: {
        select: {
          trades: true,
        },
      },
    },
  });

  if (user) {
    // Cache the counts separately for quick access
    const counts = {
      followerCount: user.followerCount,
      followingCount: user.followingCount,
    };
    await Promise.all([
      // Cache user profile
      redis.setex(
        CacheKeys.user(user.id),
        CacheTTL.USER,
        JSON.stringify(user)
      ),
      // Cache counts separately
      redis.setex(
        CacheKeys.counts(user.id),
        CacheTTL.COUNTS,
        JSON.stringify(counts)
      ),
    ]);
  }

  return user as UserProfile | null;
}

/**
 * Search users by display name or wallet address
 */
export async function searchUsers(query: string, limit: number = 10): Promise<UserProfile[]> {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { displayName: { contains: query, mode: 'insensitive' } },
        { walletAddress: { contains: query, mode: 'insensitive' } },
        { username: { contains: query, mode: 'insensitive' } },
      ],
    },
    take: limit,
    select: {
      id: true,
      privyId: true,
      walletAddress: true,
      displayName: true,
      avatarUrl: true,
      preferences: true,
      followerCount: true,
      followingCount: true,
      createdAt: true,
      updatedAt: true,
      username: true,
      normalizedUsername: true,
      onboardingStep: true,
      hasCompletedOnboarding: true,
      walletReady: true,
      hasLinkedX: true,
      authProvider: true,
      _count: {
        select: {
          trades: true,
        },
      },
    },
  });

  return users as UserProfile[];
}

/**
 * Get top traders by number of trades
 */
export async function getTopTraders(limit: number = 10, excludeUserId?: string): Promise<UserProfile[]> {
  // Fetch all users with trade counts, then sort in memory
  // This is simpler and safer than raw SQL
  const users = await prisma.user.findMany({
    where: excludeUserId ? { id: { not: excludeUserId } } : undefined,
    select: {
      id: true,
      privyId: true,
      walletAddress: true,
      displayName: true,
      avatarUrl: true,
      preferences: true,
      followerCount: true,
      followingCount: true,
      createdAt: true,
      updatedAt: true,
      username: true,
      normalizedUsername: true,
      onboardingStep: true,
      hasCompletedOnboarding: true,
      walletReady: true,
      hasLinkedX: true,
      authProvider: true,
      _count: {
        select: {
          trades: true,
        },
      },
    },
  });

  // Sort by trade count descending and take top N
  const sortedUsers = users
    .sort((a: typeof users[number], b: typeof users[number]) => b._count.trades - a._count.trades)
    .slice(0, limit);

  return sortedUsers as UserProfile[];
}

