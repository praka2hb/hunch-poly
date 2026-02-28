import { NextRequest, NextResponse } from 'next/server';
import { getUserById } from '@/app/lib/userService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Check if we should skip cache (e.g., after follow/unfollow operations)
    const skipCache = request.headers.get('cache-control') === 'no-cache';
    const user = await getUserById(userId, skipCache);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Add cache-control header to prevent browser caching when skipCache is requested
    const response = NextResponse.json(user, { status: 200 });
    if (skipCache) {
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
    return response;
  } catch (error: any) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

