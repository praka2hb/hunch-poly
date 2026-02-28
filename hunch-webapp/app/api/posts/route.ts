import { NextRequest, NextResponse } from 'next/server';
import { createPost, getPostsFeed } from '@/app/lib/postService';
import { getAuthenticatedUser, AuthError, createAuthErrorResponse } from '@/app/lib/authMiddleware';

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    const userId = authUser.userId;

    const body = await request.json();
    const { content, postType, marketTicker, side, positionSize, entryPrice } = body;

    if (!postType || !['text', 'position_share'].includes(postType)) {
      return NextResponse.json(
        { error: 'postType must be "text" or "position_share"' },
        { status: 400 }
      );
    }

    if (postType === 'text' && !content?.trim()) {
      return NextResponse.json(
        { error: 'content is required for text posts' },
        { status: 400 }
      );
    }

    if (postType === 'position_share' && !marketTicker) {
      return NextResponse.json(
        { error: 'marketTicker is required for position_share posts' },
        { status: 400 }
      );
    }

    if (side && side !== 'yes' && side !== 'no') {
      return NextResponse.json(
        { error: 'side must be "yes" or "no"' },
        { status: 400 }
      );
    }

    const post = await createPost(userId, {
      content: content?.trim() || undefined,
      postType,
      marketTicker: marketTicker || undefined,
      side: side || undefined,
      positionSize: positionSize != null ? Number(positionSize) : undefined,
      entryPrice: entryPrice != null ? Number(entryPrice) : undefined,
    });

    return NextResponse.json({ post }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(createAuthErrorResponse(error), { status: error.statusCode });
    }
    console.error('[POST /api/posts] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create post' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || undefined;
    const mode = (searchParams.get('mode') || 'global') as 'global' | 'following';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!['global', 'following'].includes(mode)) {
      return NextResponse.json(
        { error: 'mode must be "global" or "following"' },
        { status: 400 }
      );
    }

    const posts = await getPostsFeed({ userId, mode, limit, offset });

    return NextResponse.json({ posts }, { status: 200 });
  } catch (error: any) {
    console.error('[GET /api/posts] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch posts' },
      { status: 500 }
    );
  }
}
