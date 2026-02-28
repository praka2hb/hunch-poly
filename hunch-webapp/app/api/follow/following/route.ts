import { NextRequest, NextResponse } from 'next/server';
import { getFollowing } from '@/app/lib/followService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    const following = await getFollowing(userId);

    return NextResponse.json(following, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching following:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch following' },
      { status: 500 }
    );
  }
}

