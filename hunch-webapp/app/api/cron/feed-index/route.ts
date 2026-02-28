import { NextRequest, NextResponse } from 'next/server';
import { runFeedIndexing } from '@/app/lib/feedIndexingService';

// Vercel cron runs every minute
// Configure in vercel.json: { "path": "/api/cron/feed-index", "schedule": "* * * * *" }

// Optional: Add a secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
    try {
        // Verify cron secret if configured
        if (CRON_SECRET) {
            const authHeader = request.headers.get('authorization');
            if (authHeader !== `Bearer ${CRON_SECRET}`) {
                return NextResponse.json(
                    { error: 'Unauthorized' },
                    { status: 401 }
                );
            }
        }

        // Log for monitoring
        console.log("[CRON_CHECK] feed-index fired", new Date().toISOString());

        console.log(`[FeedIndex] Starting feed indexing run at ${new Date().toISOString()}`);

        const result = await runFeedIndexing();

        console.log(`[FeedIndex] Completed:`, {
            positionsScanned: result.positionsScanned,
            milestonesCreated: result.milestonesCreated,
            closedPositionsIndexed: result.closedPositionsIndexed,
            newsPromoted: result.newsPromoted,
            errors: result.errors.length,
        });

        if (result.errors.length > 0) {
            console.warn(`[FeedIndex] Errors:`, result.errors);
        }

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error: any) {
        console.error('[FeedIndex] Fatal error:', error);
        return NextResponse.json(
            { error: error.message || 'Feed indexing failed' },
            { status: 500 }
        );
    }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
    return GET(request);
}
