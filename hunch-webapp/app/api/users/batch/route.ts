import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';
import { getCachedBatch, setCachedBatch, cacheKeys } from '@/app/lib/cache';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userIds } = body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: 'userIds array is required' },
        { status: 400 }
      );
    }

    // Limit batch size
    if (userIds.length > 50) {
      return NextResponse.json(
        { error: 'Maximum 50 users per batch request' },
        { status: 400 }
      );
    }

    // Try to get cached users first
    const cacheKeys_users = userIds.map(id => cacheKeys.marketDetails(id)); // Reusing pattern
    const cachedUsers = await getCachedBatch(cacheKeys_users);
    
    const uncachedIds = userIds.filter(id => !cachedUsers.has(cacheKeys.marketDetails(id)));
    
    // Fetch uncached users from database
    let freshUsers: any[] = [];
    if (uncachedIds.length > 0) {
      freshUsers = await prisma.user.findMany({
        where: {
          id: {
            in: uncachedIds,
          },
        },
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          walletAddress: true,
          followerCount: true,
          followingCount: true,
        },
      });

      // Cache the fresh users
      const toCache = new Map();
      freshUsers.forEach(user => {
        toCache.set(cacheKeys.marketDetails(user.id), user);
      });
      await setCachedBatch(toCache, 5); // 5 second TTL
    }

    // Combine cached and fresh users
    const usersMap: Record<string, any> = {};
    
    // Add cached users
    cachedUsers.forEach((user, key) => {
      const userId = key.split(':').pop();
      if (userId) usersMap[userId] = user;
    });
    
    // Add fresh users
    freshUsers.forEach(user => {
      usersMap[user.id] = user;
    });

    const response = NextResponse.json(
      { users: usersMap },
      { status: 200 }
    );

    response.headers.set('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=10');

    return response;
  } catch (error: any) {
    console.error('Error fetching users batch:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

