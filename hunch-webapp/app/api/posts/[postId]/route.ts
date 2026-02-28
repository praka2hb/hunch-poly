import { NextRequest, NextResponse } from 'next/server';
import { deletePost } from '@/app/lib/postService';
import { getAuthenticatedUser, AuthError, createAuthErrorResponse } from '@/app/lib/authMiddleware';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const authUser = await getAuthenticatedUser(request);
    const userId = authUser.userId;
    const { postId } = await params;

    if (!postId) {
      return NextResponse.json({ error: 'postId is required' }, { status: 400 });
    }

    await deletePost(postId, userId);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(createAuthErrorResponse(error), { status: error.statusCode });
    }
    if (error.message === 'Post not found') {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }
    if (error.message === 'Forbidden') {
      return NextResponse.json({ error: 'You can only delete your own posts' }, { status: 403 });
    }
    console.error('[DELETE /api/posts/:postId] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete post' },
      { status: 500 }
    );
  }
}
