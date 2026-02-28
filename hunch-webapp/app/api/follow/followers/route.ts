import { NextRequest, NextResponse } from 'next/server';
import { getFollowers } from '@/app/lib/followService';

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

    const followers = await getFollowers(userId);

    return NextResponse.json(followers, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching followers:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch followers' },
      { status: 500 }
    );
  }
}

