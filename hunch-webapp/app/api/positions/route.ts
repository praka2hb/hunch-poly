import { NextRequest, NextResponse } from 'next/server';
import { getUserPositions, getUserPositionStats } from '../../lib/positionService';
import { prisma } from '../../lib/db';
import { unstable_cache } from 'next/cache';

/**
 * GET /api/positions?userId={userId}
 * Get user's aggregated positions with P&L calculations
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const includeStats = searchParams.get('includeStats') === 'true';

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    // Check if we should skip cache
    const skipCache = request.headers.get('cache-control') === 'no-cache';
    
    const getCachedPositions = unstable_cache(
      async (uid: string) => getUserPositions(uid),
      [`positions-${userId}`],
      { 
        revalidate: 5, // 5 second revalidation for positions
        tags: [`positions-${userId}`, `trades-${userId}`]
      }
    );

    const positions = skipCache 
      ? await getUserPositions(userId)
      : await getCachedPositions(userId);

    let stats = null;
    if (includeStats) {
      const getCachedStats = unstable_cache(
        async (uid: string) => getUserPositionStats(uid),
        [`position-stats-${userId}`],
        { 
          revalidate: 10, // 10 second revalidation for stats
          tags: [`positions-${userId}`, `trades-${userId}`]
        }
      );

      stats = skipCache 
        ? await getUserPositionStats(userId)
        : await getCachedStats(userId);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { walletAddress: true },
    });

    const response = NextResponse.json(
      {
        positions,
        stats,
        walletAddress: user?.walletAddress || null,
      },
      { status: 200 }
    );
    
    if (!skipCache) {
      response.headers.set('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=15');
    }

    return response;
  } catch (error: any) {
    console.error('Error fetching positions:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch positions' },
      { status: 500 }
    );
  }
}

