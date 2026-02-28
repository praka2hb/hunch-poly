import { NextRequest, NextResponse } from 'next/server';
import { getUserByDisplayName } from '@/app/lib/userService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Decode username - handle double-encoding (%2540 -> %40 -> @)
    let decodedUsername = decodeURIComponent(username);
    // If still contains %40, decode again (double-encoded)
    if (decodedUsername.includes('%40')) {
      decodedUsername = decodeURIComponent(decodedUsername);
    }
    // Strip leading @ if present (e.g., @vzy010 -> vzy010)
    if (decodedUsername.startsWith('@')) {
      decodedUsername = decodedUsername.slice(1);
    }

    console.log(`[by-username] Looking up: raw="${username}" decoded="${decodedUsername}"`);

    // Check if we should skip cache (e.g., after follow/unfollow operations)
    const skipCache = request.headers.get('cache-control') === 'no-cache';

    // Try displayName first, then wallet address as fallback
    let user = await getUserByDisplayName(decodedUsername);

    if (!user) {
      console.log(`[by-username] User not found: "${decodedUsername}"`);
      return NextResponse.json(
        { error: 'User not found', searched: decodedUsername },
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
    console.error('Error fetching user by username:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

