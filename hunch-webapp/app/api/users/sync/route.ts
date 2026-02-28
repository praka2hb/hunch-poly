import { NextRequest, NextResponse } from 'next/server';
import { syncUser } from '@/app/lib/userService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { privyId, walletAddress, displayName, avatarUrl, preferences } = body;

    if (!privyId || !walletAddress) {
      return NextResponse.json(
        { error: 'privyId and walletAddress are required' },
        { status: 400 }
      );
    }

    // Strip @ prefix from displayName if present (Privy returns @username format)
    const cleanDisplayName = displayName?.startsWith('@')
      ? displayName.slice(1)
      : displayName;

    const user = await syncUser({
      privyId,
      walletAddress,
      displayName: cleanDisplayName,
      avatarUrl,
      preferences,
    });

    return NextResponse.json(user, { status: 200 });
  } catch (error: any) {
    console.error('Error syncing user:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to sync user' },
      { status: 500 }
    );
  }
}

