import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, AuthError, createAuthErrorResponse } from '@/app/lib/authMiddleware';
import { prisma } from '@/app/lib/db';

/**
 * GET /api/users/delegation-status
 * Returns the CLOB key status and delegation status for copy trading.
 * Used to check if user has set up their Polymarket CLOB credentials
 * and if copy trading delegation is configured.
 */
export async function GET(request: NextRequest) {
    try {
        const authUser = await getAuthenticatedUser(request);

        const user = await prisma.user.findUnique({
            where: { id: authUser.userId },
            select: {
                clobApiKey: true,
                walletAddress: true,
            },
        });

        return NextResponse.json({
            hasClobCredentials: !!user?.clobApiKey,
            walletAddress: user?.walletAddress || null,
        });
    } catch (error: any) {
        if (error instanceof AuthError) {
            return NextResponse.json(createAuthErrorResponse(error), { status: error.statusCode });
        }
        console.error('Error fetching delegation status:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch delegation status' },
            { status: 500 }
        );
    }
}
