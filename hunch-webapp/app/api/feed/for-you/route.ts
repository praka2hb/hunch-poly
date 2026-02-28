import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';

// Feed response types (same as following endpoint)
export interface FeedItemResponse {
    id: string;
    type: 'TRADE_MILESTONE' | 'POSITION_CLOSED' | 'NEWS';

    // User info
    user: {
        id: string;
        displayName: string | null;
        avatarUrl: string | null;
        walletAddress: string;
    } | null;

    // Market context
    marketTicker: string;
    eventTicker: string | null;
    side: 'yes' | 'no' | null;

    // Milestone context (for TRADE_MILESTONE)
    milestoneType: string | null;
    milestoneValue: number | null;

    // Position closed context
    finalPnL: number | null;

    // News context (for NEWS type)
    evidence: {
        id: string;
        headline: string | null;
        explanation: string | null;
        classification: string;
        highlightScore: number;
        sourceUrls: string[];
        sourceTitles: string[];
    } | null;

    // Timestamps
    createdAt: string;
    score: number;
}

/**
 * GET /api/feed/for-you
 * Returns global high-signal FeedItems ranked by score
 * Available to all users (authenticated and unauthenticated)
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
        const cursor = searchParams.get('cursor'); // For pagination
        const excludeUserId = searchParams.get('excludeUserId'); // Optional: exclude own items

        // Build the query
        const whereClause: any = {};

        // Optionally exclude the current user's items, but KEEP items with null userId (e.g., NEWS)
        if (excludeUserId) {
            whereClause.OR = [
                { userId: null }, // Include NEWS items (no user)
                { userId: { not: excludeUserId } }, // Exclude current user's milestones
            ];
        }

        // Cursor-based pagination
        if (cursor) {
            whereClause.createdAt = { lt: new Date(cursor) };
        }

        // Fetch global FeedItems ranked by score, then recency
        const feedItems = await prisma.feedItem.findMany({
            where: whereClause,
            orderBy: [
                { score: 'desc' },
                { createdAt: 'desc' },
            ],
            take: limit + 1,
            include: {
                user: {
                    select: {
                        id: true,
                        displayName: true,
                        avatarUrl: true,
                        walletAddress: true,
                    },
                },
            },
        });

        // Determine pagination
        const hasMore = feedItems.length > limit;
        const items = hasMore ? feedItems.slice(0, limit) : feedItems;
        const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;

        // Hydrate news evidence for NEWS type items
        const newsEvidenceIds = items
            .filter(item => item.type === 'NEWS' && item.evidenceId)
            .map(item => item.evidenceId as string);

        console.log('[ForYou] NEWS items found:', items.filter(i => i.type === 'NEWS').length);
        console.log('[ForYou] Evidence IDs to hydrate:', newsEvidenceIds);

        let evidenceMap = new Map<string, any>();
        if (newsEvidenceIds.length > 0) {
            const evidenceRecords = await prisma.eventEvidence.findMany({
                where: { id: { in: newsEvidenceIds } },
            });
            console.log('[ForYou] Evidence records found:', evidenceRecords.length);
            for (const e of evidenceRecords) {
                evidenceMap.set(e.id, e);
            }
        }

        // Format response
        const response: FeedItemResponse[] = items.map(item => {
            // Get evidence for NEWS items
            let evidence = null;
            if (item.type === 'NEWS' && item.evidenceId) {
                const e = evidenceMap.get(item.evidenceId);
                console.log('[ForYou] Looking up evidence for', item.evidenceId, '- found:', !!e);
                if (e) {
                    evidence = {
                        id: e.id,
                        headline: e.headline,
                        explanation: e.explanation,
                        classification: e.classification,
                        highlightScore: e.highlightScore,
                        sourceUrls: e.sourceUrls,
                        sourceTitles: e.sourceTitles,
                    };
                }
            }

            return {
                id: item.id,
                type: item.type,
                user: item.user,
                marketTicker: item.marketTicker,
                eventTicker: item.eventTicker,
                side: item.side as 'yes' | 'no' | null,
                milestoneType: item.milestoneType,
                milestoneValue: item.milestoneValue,
                finalPnL: item.finalPnL,
                evidence,
                createdAt: item.createdAt.toISOString(),
                score: item.score,
            };
        });

        const httpResponse = NextResponse.json({
            items: response,
            nextCursor,
        });

        // Cache for unauthenticated requests
        if (!excludeUserId) {
            httpResponse.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
        }

        return httpResponse;
    } catch (error: any) {
        console.error('Error fetching for-you feed:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch feed' },
            { status: 500 }
        );
    }
}
