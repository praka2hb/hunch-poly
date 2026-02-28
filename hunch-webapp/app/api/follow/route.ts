import { NextRequest, NextResponse } from 'next/server';
import { followUser, unfollowUser } from '@/app/lib/followService';
import { getAuthenticatedUser, AuthError, createAuthErrorResponse } from '@/app/lib/authMiddleware';

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Get followerId from authenticated Privy session, not from body
    const authUser = await getAuthenticatedUser(request);
    const followerId = authUser.userId;

    const body = await request.json();
    const { followingId } = body;

    console.log('POST /api/follow - Request:', { followerId, followingId });

    if (!followingId) {
      return NextResponse.json(
        { error: 'followingId is required' },
        { status: 400 }
      );
    }

    const follow = await followUser(followerId, followingId);
    console.log('POST /api/follow - Success:', follow.id);

    return NextResponse.json(follow, { status: 200 });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(createAuthErrorResponse(error), { status: error.statusCode });
    }
    console.error('Error following user:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { error: error.message || 'Failed to follow user' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // SECURITY: Get followerId from authenticated Privy session, not from body
    const authUser = await getAuthenticatedUser(request);
    const followerId = authUser.userId;

    const body = await request.json();
    const { followingId } = body;

    console.log('DELETE /api/follow - Request:', { followerId, followingId });

    if (!followingId) {
      return NextResponse.json(
        { error: 'followingId is required' },
        { status: 400 }
      );
    }

    const result = await unfollowUser(followerId, followingId);
    console.log('DELETE /api/follow - Success:', result.count, 'relationships deleted');

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(createAuthErrorResponse(error), { status: error.statusCode });
    }
    console.error('Error unfollowing user:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { error: error.message || 'Failed to unfollow user' },
      { status: 500 }
    );
  }
}
