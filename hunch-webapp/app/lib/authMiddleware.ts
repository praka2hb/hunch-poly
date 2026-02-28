/**
 * Server-side Authentication Middleware
 * 
 * Uses Privy JWT verification to authenticate API requests.
 * Extracts userId from database by looking up the user by privyId.
 */

import { NextRequest } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from './db';

// Initialize Privy client for token verification
const privyClient = new PrivyClient(
    process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
    process.env.PRIVY_APP_SECRET!
);

export interface AuthenticatedUser {
    userId: string;
    privyId: string;
    walletAddress: string;
}

export class AuthError extends Error {
    public statusCode: number;
    public code: string;

    constructor(message: string, statusCode: number = 401, code: string = 'UNAUTHORIZED') {
        super(message);
        this.name = 'AuthError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

/**
 * Extract the access token from the request
 * Supports both Authorization header and privy-token cookie
 */
function extractAccessToken(request: NextRequest): string | null {
    // Check Authorization header first (preferred)
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.slice(7);
    }

    // Fall back to privy-token cookie
    const cookieToken = request.cookies.get('privy-token')?.value;
    if (cookieToken) {
        return cookieToken;
    }

    return null;
}

/**
 * Verify the Privy access token and return the user
 * Throws AuthError if token is invalid or user not found
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<AuthenticatedUser> {
    const accessToken = extractAccessToken(request);

    if (!accessToken) {
        throw new AuthError(
            'Authentication required. Please provide a valid access token.',
            401,
            'MISSING_TOKEN'
        );
    }

    try {
        // Verify token with Privy
        const verifiedClaims = await privyClient.verifyAuthToken(accessToken);
        const privyId = verifiedClaims.userId;

        // Look up user in database
        const user = await prisma.user.findUnique({
            where: { privyId },
            select: {
                id: true,
                privyId: true,
                walletAddress: true,
            },
        });

        if (!user) {
            throw new AuthError(
                'User not found. Please sync your account first.',
                401,
                'USER_NOT_FOUND'
            );
        }

        return {
            userId: user.id,
            privyId: user.privyId,
            walletAddress: user.walletAddress,
        };
    } catch (error) {
        if (error instanceof AuthError) {
            throw error;
        }

        // Token verification failed
        console.error('[AuthMiddleware] Token verification failed:', error);
        throw new AuthError(
            'Invalid or expired access token. Please re-authenticate.',
            401,
            'INVALID_TOKEN'
        );
    }
}

/**
 * Try to get the authenticated user, but return null instead of throwing
 * Useful for routes that have mixed authenticated/unauthenticated behavior
 */
export async function getOptionalAuthUser(request: NextRequest): Promise<AuthenticatedUser | null> {
    try {
        return await getAuthenticatedUser(request);
    } catch (error) {
        if (error instanceof AuthError) {
            return null;
        }
        throw error;
    }
}

/**
 * Helper to create a standardized error response
 */
export function createAuthErrorResponse(error: AuthError) {
    return {
        error: error.message,
        code: error.code,
    };
}
