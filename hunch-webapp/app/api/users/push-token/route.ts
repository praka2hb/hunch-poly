import { NextRequest, NextResponse } from 'next/server';
import Expo from 'expo-server-sdk';
import { prisma } from '@/app/lib/db';
import { getAuthenticatedUser, AuthError, createAuthErrorResponse } from '@/app/lib/authMiddleware';
import { createLogger } from '@/app/lib/logger';

const log = createLogger('push-token');

/**
 * POST /api/users/push-token
 *
 * Registers or updates an Expo push token for the authenticated user.
 *
 * Body: { expoPushToken: string }
 */
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    const userId = authUser.userId;

    const body = await request.json();
    const { expoPushToken } = body;

    // ── Validation ──────────────────────────────────────────────

    if (typeof expoPushToken !== 'string' || !expoPushToken.trim()) {
      return NextResponse.json(
        { error: 'expoPushToken is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    if (!Expo.isExpoPushToken(expoPushToken)) {
      return NextResponse.json(
        { error: 'Invalid Expo push token format' },
        { status: 400 }
      );
    }

    // ── Persist ─────────────────────────────────────────────────

    await prisma.user.update({
      where: { id: userId },
      data: { expoPushToken },
    });

    log.info({ userId }, 'Push token registered');

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(createAuthErrorResponse(error), { status: error.statusCode });
    }
    log.error({ err: error }, 'Failed to register push token');
    return NextResponse.json(
      { error: 'Failed to register push token' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/users/push-token
 *
 * Removes the push token for the authenticated user (opt-out / logout).
 */
export async function DELETE(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    const userId = authUser.userId;

    await prisma.user.update({
      where: { id: userId },
      data: { expoPushToken: null },
    });

    log.info({ userId }, 'Push token removed');

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(createAuthErrorResponse(error), { status: error.statusCode });
    }
    log.error({ err: error }, 'Failed to remove push token');
    return NextResponse.json(
      { error: 'Failed to remove push token' },
      { status: 500 }
    );
  }
}
