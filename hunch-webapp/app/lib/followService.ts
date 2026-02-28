import { prisma } from './db';
import redis, { CacheKeys, CacheTTL } from './redis';

export interface FollowRelationship {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: Date;
  follower: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    walletAddress: string;
  };
  following: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    walletAddress: string;
  };
}

/**
 * Follow a user
 */
export async function followUser(followerId: string, followingId: string) {
  // Prevent self-follow
  if (followerId === followingId) {
    throw new Error('Cannot follow yourself');
  }

  // Check if already following
  const existingFollow = await prisma.follow.findUnique({
    where: {
      followerId_followingId: {
        followerId,
        followingId,
      },
    },
  });

  if (existingFollow) {
    return existingFollow;
  }

  // Verify both users exist
  const [follower, following] = await Promise.all([
    prisma.user.findUnique({ where: { id: followerId } }),
    prisma.user.findUnique({ where: { id: followingId } }),
  ]);

  if (!follower) {
    throw new Error(`Follower user with id ${followerId} not found`);
  }
  if (!following) {
    throw new Error(`Following user with id ${followingId} not found`);
  }

  // Try transaction first, fallback to sequential operations if it fails
  try {
    const follow = await prisma.$transaction(
      async (tx) => {
        // Create follow relationship
        const followRecord = await tx.follow.create({
          data: {
            followerId,
            followingId,
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
            following: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
                walletAddress: true,
              },
            },
          },
        });

        // Increment counts atomically using raw SQL so we don't depend on Prisma field metadata
        await Promise.all([
          tx.$executeRaw`UPDATE "User" SET "followingCount" = "followingCount" + 1 WHERE id = ${followerId}`,
          tx.$executeRaw`UPDATE "User" SET "followerCount" = "followerCount" + 1 WHERE id = ${followingId}`,
        ]);

        console.log(`Updated counts (transaction) - Follower: ${followerId}, Following: ${followingId}`);
        return followRecord;
      },
      {
        maxWait: 5000, // 5 seconds max wait to acquire connection
        timeout: 15000, // 15 seconds timeout for transaction
      }
    );

    console.log(`Follow created (transaction): ${followerId} -> ${followingId}`);
    await invalidateFollowCaches(followerId, followingId);
    return follow;
  } catch (transactionError: any) {
    // If transaction fails (e.g., timeout), fallback to sequential operations
    if (transactionError.code === 'P2028' || transactionError.message?.includes('transaction')) {
      console.warn('Transaction failed, using sequential operations:', transactionError.message);

      try {
        // Create follow relationship
        const followRecord = await prisma.follow.create({
          data: {
            followerId,
            followingId,
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
            following: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
                walletAddress: true,
              },
            },
          },
        });

        // Update counts sequentially using raw SQL
        await Promise.all([
          prisma.$executeRaw`UPDATE "User" SET "followingCount" = "followingCount" + 1 WHERE id = ${followerId}`,
          prisma.$executeRaw`UPDATE "User" SET "followerCount" = "followerCount" + 1 WHERE id = ${followingId}`,
        ]);

        console.log(`Follow created (sequential): ${followerId} -> ${followingId}`);
        await invalidateFollowCaches(followerId, followingId);
        return followRecord;
      } catch (sequentialError) {
        // If sequential also fails, try to clean up
        await prisma.follow.deleteMany({
          where: { followerId, followingId },
        }).catch(() => { });
        throw sequentialError;
      }
    } else {
      throw transactionError;
    }
  }

}

/**
 * Unfollow a user
 */
export async function unfollowUser(followerId: string, followingId: string) {
  // Try transaction first, fallback to sequential operations if it fails
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // Delete follow relationship
        const deleteResult = await tx.follow.deleteMany({
          where: {
            followerId,
            followingId,
          },
        });

        // Only decrement counts if a relationship was actually deleted
        if (deleteResult.count > 0) {
          console.log(`Deleting copy settings for follower: ${followerId}, leader: ${followingId}`);
          await Promise.all([
            tx.$executeRaw`UPDATE "User" SET "followingCount" = GREATEST("followingCount" - 1, 0) WHERE id = ${followerId}`,
            tx.$executeRaw`UPDATE "User" SET "followerCount" = GREATEST("followerCount" - 1, 0) WHERE id = ${followingId}`,
            // Delete copy settings when unfollowing
            tx.copySettings.deleteMany({
              where: {
                followerId,
                leaderId: followingId,
              },
            }),
          ]);
          console.log(`Copy settings deletion completed for follower: ${followerId}, leader: ${followingId}`);
        }

        return deleteResult;
      },
      {
        maxWait: 5000, // 5 seconds max wait to acquire connection
        timeout: 15000, // 15 seconds timeout for transaction
      }
    );

    console.log(`Unfollow successful (transaction): ${followerId} -> ${followingId}, deleted: ${result.count}`);
    await invalidateFollowCaches(followerId, followingId);
    return result;
  } catch (transactionError: any) {
    // If transaction fails (e.g., timeout), fallback to sequential operations
    if (transactionError.code === 'P2028' || transactionError.message?.includes('transaction')) {
      console.warn('Transaction failed, using sequential operations:', transactionError.message);

      try {
        // Delete follow relationship
        const deleteResult = await prisma.follow.deleteMany({
          where: {
            followerId,
            followingId,
          },
        });

        // Only decrement counts if a relationship was actually deleted
        if (deleteResult.count > 0) {
          console.log(`[Sequential] Deleting copy settings for follower: ${followerId}, leader: ${followingId}`);
          await Promise.all([
            prisma.$executeRaw`UPDATE "User" SET "followingCount" = GREATEST("followingCount" - 1, 0) WHERE id = ${followerId}`,
            prisma.$executeRaw`UPDATE "User" SET "followerCount" = GREATEST("followerCount" - 1, 0) WHERE id = ${followingId}`,
            // Delete copy settings when unfollowing
            prisma.copySettings.deleteMany({
              where: {
                followerId,
                leaderId: followingId,
              },
            }),
          ]);
          console.log(`[Sequential] Copy settings deletion completed for follower: ${followerId}, leader: ${followingId}`);
        }

        console.log(`Unfollow successful (sequential): ${followerId} -> ${followingId}, deleted: ${deleteResult.count}`);
        await invalidateFollowCaches(followerId, followingId);
        return deleteResult;
      } catch (sequentialError) {
        console.error('Error in sequential unfollow operations:', sequentialError);
        throw sequentialError;
      }
    } else {
      throw transactionError;
    }
  }
}

/**
 * Check if user A is following user B
 */
export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  // Try cache first
  const cacheKey = CacheKeys.follows(followerId);
  const cached = await redis.get<string[]>(cacheKey);

  if (cached) {
    return cached.includes(followingId);
  }

  // Check database
  const follow = await prisma.follow.findUnique({
    where: {
      followerId_followingId: {
        followerId,
        followingId,
      },
    },
  });

  return !!follow;
}

/**
 * Get list of user IDs that a user is following (with caching)
 */
export async function getFollowingIds(userId: string): Promise<string[]> {
  // Try cache first
  const cacheKey = CacheKeys.follows(userId);
  const cached = await redis.get<string[]>(cacheKey);

  if (cached) {
    return cached;
  }

  // Fetch from database
  const follows = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });

  const followingIds = follows.map((f) => f.followingId);

  // Cache the result
  await redis.setex(cacheKey, CacheTTL.FOLLOWS, JSON.stringify(followingIds));

  return followingIds;
}

/**
 * Get list of users being followed (with user details)
 */
export async function getFollowing(userId: string): Promise<FollowRelationship[]> {
  const follows = await prisma.follow.findMany({
    where: { followerId: userId },
    include: {
      follower: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          walletAddress: true,
        },
      },
      following: {
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

  return follows;
}

/**
 * Get list of followers (with user details)
 */
export async function getFollowers(userId: string): Promise<FollowRelationship[]> {
  const follows = await prisma.follow.findMany({
    where: { followingId: userId },
    include: {
      follower: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          walletAddress: true,
        },
      },
      following: {
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

  return follows;
}

/**
 * Get follower and following counts
 */
export async function getFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
  const [followers, following] = await Promise.all([
    prisma.follow.count({
      where: { followingId: userId },
    }),
    prisma.follow.count({
      where: { followerId: userId },
    }),
  ]);

  return { followers, following };
}

/**
 * Invalidate follow-related caches
 */
async function invalidateFollowCaches(followerId: string, followingId: string) {
  // Use Promise.all to ensure all cache invalidations complete
  await Promise.all([
    // Invalidate follower's follow list cache
    redis.del(CacheKeys.follows(followerId)),

    // Invalidate follower's feed cache
    redis.del(CacheKeys.feed(followerId)),

    // Invalidate following user's followers cache
    redis.del(CacheKeys.followers(followingId)),

    // Invalidate user profile caches
    redis.del(CacheKeys.user(followerId)),
    redis.del(CacheKeys.user(followingId)),

    // Invalidate count caches (use CacheKeys helper for consistency)
    redis.del(CacheKeys.counts(followerId)),
    redis.del(CacheKeys.counts(followingId)),

    // Also invalidate the following list cache for the user being followed
    redis.del(CacheKeys.following(followingId)),
  ]);

  console.log(`Cache invalidated for follow: ${followerId} -> ${followingId}`);
}

