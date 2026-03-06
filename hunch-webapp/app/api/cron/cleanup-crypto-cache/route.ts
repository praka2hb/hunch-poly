import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
    try {
        // Verify cron secret (same pattern as feed-index cron)
        if (CRON_SECRET) {
            const authHeader = request.headers.get('authorization');
            if (authHeader !== `Bearer ${CRON_SECRET}`) {
                return NextResponse.json(
                    { error: 'Unauthorized' },
                    { status: 401 }
                );
            }
        }

        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

        const deleted = await prisma.cryptoMarketCache.deleteMany({
            where: {
                createdAt: { lt: twoDaysAgo },
            },
        });

        console.log(`[cleanup] Deleted ${deleted.count} expired crypto market cache entries`);

        return NextResponse.json({
            deleted: deleted.count,
            before: twoDaysAgo.toISOString(),
        });
    } catch (error: unknown) {
        console.error('[cleanup-crypto-cache] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Cleanup failed' },
            { status: 500 }
        );
    }
}
