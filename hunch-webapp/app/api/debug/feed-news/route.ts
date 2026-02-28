import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';

// Debug endpoint to check FeedItem and EventEvidence linking
export async function GET(request: NextRequest) {
    try {
        // Get all NEWS FeedItems
        const newsFeedItems = await prisma.feedItem.findMany({
            where: { type: 'NEWS' },
        });

        // Get all EventEvidence IDs
        const allEvidenceIds = await prisma.eventEvidence.findMany({
            select: { id: true, headline: true, highlightScore: true },
        });

        // Check each FeedItem
        const results = newsFeedItems.map(item => {
            const evidenceExists = allEvidenceIds.some(e => e.id === item.evidenceId);
            return {
                feedItemId: item.id,
                evidenceId: item.evidenceId,
                evidenceExists,
                marketTicker: item.marketTicker,
            };
        });

        return NextResponse.json({
            newsFeedItems: results,
            totalEvidence: allEvidenceIds.length,
            evidenceSamples: allEvidenceIds.slice(0, 3),
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
