import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sortBy = searchParams.get('sortBy') || 'followers';
    const limitParam = searchParams.get('limit');
    const limit = Math.min(Math.max(parseInt(limitParam || '10', 10), 1), 100);

    if (sortBy !== 'followers') {
      return NextResponse.json(
        { error: 'sortBy must be "followers"' },
        { status: 400 }
      );
    }

    const users = await prisma.user.findMany({
      orderBy: { followerCount: 'desc' },
      take: limit,
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        walletAddress: true,
        followerCount: true,
        followingCount: true,
      },
    });

    return NextResponse.json(users, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching top users:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch top users' },
      { status: 500 }
    );
  }
}
