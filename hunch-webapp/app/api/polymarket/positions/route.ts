import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, AuthError, createAuthErrorResponse } from '@/app/lib/authMiddleware';

const GAMMA_BASE_URL = process.env.POLYMARKET_GAMMA_URL || 'https://gamma-api.polymarket.com';

/**
 * GET /api/polymarket/positions
 * 
 * Fetch on-chain positions for the authenticated user from Polymarket.
 * Uses the Gamma API to query positions by the user's wallet address.
 * 
 * Positions are on-chain — this endpoint reads from Polymarket's indexer,
 * not from our database.
 * 
 * Query params:
 *   - status: "open" | "closed" | "all" (default "open")
 */
export async function GET(request: NextRequest) {
    try {
        const authUser = await getAuthenticatedUser(request);
        const sp = request.nextUrl.searchParams;
        const status = sp.get('status') || 'open';

        // Fetch positions from Gamma API by wallet address
        const url = new URL('/positions', GAMMA_BASE_URL);
        url.searchParams.set('user', authUser.walletAddress);
        if (status === 'open') {
            url.searchParams.set('redeemed', 'false');
        } else if (status === 'closed') {
            url.searchParams.set('redeemed', 'true');
        }

        console.log(`[positions] Fetching positions for wallet ${authUser.walletAddress}`);

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[positions] Gamma API error:', {
                status: response.status,
                error: errorText,
                wallet: authUser.walletAddress,
            });
            return NextResponse.json(
                { error: `Failed to fetch positions: ${response.status}` },
                { status: 502 }
            );
        }

        const positions = await response.json();

        // Normalize positions for the mobile app
        const normalizedPositions = Array.isArray(positions) ? positions.map((pos: any) => ({
            conditionId: pos.conditionId || pos.condition_id,
            tokenId: pos.tokenId || pos.token_id,
            outcome: pos.outcome,
            size: pos.size,
            avgPrice: pos.avgPrice || pos.avg_price,
            currentPrice: pos.currentPrice || pos.current_price,
            pnl: pos.pnl,
            realizedPnl: pos.realizedPnl || pos.realized_pnl,
            unrealizedPnl: pos.unrealizedPnl || pos.unrealized_pnl,
            redeemed: pos.redeemed,
            market: pos.market ? {
                conditionId: pos.market.condition_id,
                question: pos.market.question,
                slug: pos.market.slug,
                image: pos.market.image,
                active: pos.market.active,
            } : null,
        })) : [];

        return NextResponse.json({
            positions: normalizedPositions,
            walletAddress: authUser.walletAddress,
            total: normalizedPositions.length,
        }, {
            headers: {
                'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20',
            },
        });
    } catch (error: any) {
        if (error instanceof AuthError) {
            return NextResponse.json(createAuthErrorResponse(error), { status: error.statusCode });
        }
        console.error('[API /polymarket/positions] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch positions' },
            { status: 500 }
        );
    }
}
