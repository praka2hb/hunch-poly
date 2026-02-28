import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';
import { getFollowingIds } from '@/app/lib/followService';

// Feed response types
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
 * GET /api/feed/following
 * Returns FeedItems from users the current user follows
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
        const cursor = searchParams.get('cursor'); // For pagination

        if (!userId) {
            return NextResponse.json(
                { error: 'userId is required for following feed' },
                { status: 400 }
            );
        }

        // Get list of users being followed
        const followingIds = await getFollowingIds(userId);

        if (followingIds.length === 0) {
            return NextResponse.json({
                items: [],
                nextCursor: null,
            });
        }

        // Build the query
        const whereClause: any = {
            userId: { in: followingIds },
        };

        // Cursor-based pagination
        if (cursor) {
            whereClause.createdAt = { lt: new Date(cursor) };
        }

        // Fetch FeedItems from followed users
        const feedItems = await prisma.feedItem.findMany({
            where: whereClause,
            orderBy: [
                { score: 'desc' },
                { createdAt: 'desc' },
            ],
            take: limit + 1, // Fetch one extra to determine if there's more
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

        // Determine if there are more items
        const hasMore = feedItems.length > limit;
        const items = hasMore ? feedItems.slice(0, limit) : feedItems;
        const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;

        // Hydrate news evidence for NEWS type items
        const newsEvidenceIds = items
            .filter(item => item.type === 'NEWS' && item.evidenceId)
            .map(item => item.evidenceId as string);

        let evidenceMap = new Map<string, any>();
        if (newsEvidenceIds.length > 0) {
            const evidenceRecords = await prisma.eventEvidence.findMany({
                where: { id: { in: newsEvidenceIds } },
            });
            evidenceMap = new Map(evidenceRecords.map(e => [e.id, e]));
        }

        // Format response
        const response: FeedItemResponse[] = items.map(item => ({
            id: item.id,
            type: item.type,
            user: item.user,
            marketTicker: item.marketTicker,
            eventTicker: item.eventTicker,
            side: item.side as 'yes' | 'no' | null,
            milestoneType: item.milestoneType,
            milestoneValue: item.milestoneValue,
            finalPnL: item.finalPnL,
            evidence: item.evidenceId ? (() => {
                const e = evidenceMap.get(item.evidenceId);
                return e ? {
                    id: e.id,
                    headline: e.headline,
                    explanation: e.explanation,
                    classification: e.classification,
                    highlightScore: e.highlightScore,
                    sourceUrls: e.sourceUrls,
                    sourceTitles: e.sourceTitles,
                } : null;
            })() : null,
            createdAt: item.createdAt.toISOString(),
            score: item.score,
        }));

        return NextResponse.json({
            items: response,
            nextCursor,
        });
    } catch (error: any) {
        console.error('Error fetching following feed:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch feed' },
            { status: 500 }
        );
    }
}
