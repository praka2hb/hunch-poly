import 'server-only';

import { prisma } from './db';
import { MilestoneType, FeedItemType, Prisma } from '@prisma/client';
import { fetchMarketDetailsServer } from './dflowServer';

// ==============================
// Milestone Thresholds Configuration
// ==============================

interface MilestoneThreshold {
    type: MilestoneType;
    threshold: number; // PnL percentage threshold
    direction: 'positive' | 'negative';
}

// Ordered by priority (higher priority first)
const MILESTONE_THRESHOLDS: MilestoneThreshold[] = [
    { type: 'PNL_PLUS_20', threshold: 20, direction: 'positive' },
    { type: 'PNL_PLUS_10', threshold: 10, direction: 'positive' },
    { type: 'PNL_PLUS_5', threshold: 5, direction: 'positive' },
    { type: 'PNL_MINUS_10', threshold: -10, direction: 'negative' },
    { type: 'PNL_MINUS_5', threshold: -5, direction: 'negative' },
];

// News promotion threshold
const NEWS_HIGHLIGHT_THRESHOLD = 0.25;

// Score weights for feed ranking
const SCORE_WEIGHTS = {
    PNL_PLUS_20: 100,
    PNL_PLUS_10: 80,
    PNL_PLUS_5: 60,
    PNL_MINUS_10: 50,
    PNL_MINUS_5: 40,
    POSITION_CLOSED: 70,
    NEWS: 200, // Higher base score so news appears prominently (200 * 0.25 = 50+)
};

// ==============================
// Milestone Detection Logic
// ==============================

/**
 * Detects all milestones that a position has crossed based on current PnL percentage.
 * Returns milestones in priority order (highest first).
 */
function detectCrossedMilestones(pnlPercent: number): MilestoneType[] {
    const crossed: MilestoneType[] = [];

    for (const milestone of MILESTONE_THRESHOLDS) {
        if (milestone.direction === 'positive' && pnlPercent >= milestone.threshold) {
            crossed.push(milestone.type);
        } else if (milestone.direction === 'negative' && pnlPercent <= milestone.threshold) {
            crossed.push(milestone.type);
        }
    }

    return crossed;
}

/**
 * Gets current market price for a specific side
 */
function getCurrentMarketPrice(
    market: { yesBid?: string; yesAsk?: string; noBid?: string; noAsk?: string },
    side: 'yes' | 'no'
): number | null {
    if (side === 'yes') {
        if (market.yesBid && market.yesAsk) {
            return (parseFloat(market.yesBid) + parseFloat(market.yesAsk)) / 2;
        }
        if (market.yesBid) return parseFloat(market.yesBid);
        if (market.yesAsk) return parseFloat(market.yesAsk);
    } else {
        if (market.noBid && market.noAsk) {
            return (parseFloat(market.noBid) + parseFloat(market.noAsk)) / 2;
        }
        if (market.noBid) return parseFloat(market.noBid);
        if (market.noAsk) return parseFloat(market.noAsk);
    }
    return null;
}

/**
 * Computes unrealized PnL percentage for a position
 */
function computeUnrealizedPnLPercent(
    avgEntryPrice: number,
    currentPrice: number,
    netQuantity: number
): number {
    if (avgEntryPrice === 0 || netQuantity <= 0) return 0;

    const costBasis = avgEntryPrice * netQuantity;
    const currentValue = currentPrice * netQuantity;
    const unrealizedPnL = currentValue - costBasis;

    return (unrealizedPnL / costBasis) * 100;
}

// ==============================
// Core Indexing Functions
// ==============================

interface IndexingResult {
    positionsScanned: number;
    milestonesCreated: number;
    closedPositionsIndexed: number;
    newsPromoted: number;
    errors: string[];
}

/**
 * Main indexing function - scans positions and creates FeedItems for milestones
 */
export async function runFeedIndexing(): Promise<IndexingResult> {
    const result: IndexingResult = {
        positionsScanned: 0,
        milestonesCreated: 0,
        closedPositionsIndexed: 0,
        newsPromoted: 0,
        errors: [],
    };

    try {
        // 1. Scan all OPEN positions
        await indexOpenPositions(result);

        // 2. Scan recently CLOSED positions
        await indexClosedPositions(result);

        // 3. Promote high-impact news (optional, can be disabled)
        await promoteHighImpactNews(result);

    } catch (error: any) {
        result.errors.push(`Top-level error: ${error.message}`);
    }

    return result;
}

/**
 * Scans open positions, computes PnL, and creates milestone FeedItems
 */
async function indexOpenPositions(result: IndexingResult): Promise<void> {
    // Get all open positions
    const openPositions = await prisma.position.findMany({
        where: { status: 'OPEN' },
        select: {
            id: true,
            userId: true,
            marketTicker: true,
            eventTicker: true,
            side: true,
            avgEntryPrice: true,
            netQuantity: true,
        },
    });

    result.positionsScanned = openPositions.length;

    // Group positions by marketTicker to batch market fetches
    const marketTickerSet = new Set(openPositions.map(p => p.marketTicker));
    const marketDataMap = new Map<string, any>();

    // Fetch market data for all unique tickers
    await Promise.all(
        Array.from(marketTickerSet).map(async (ticker) => {
            try {
                const market = await fetchMarketDetailsServer(ticker);
                marketDataMap.set(ticker, market);
            } catch (e: any) {
                result.errors.push(`Failed to fetch market ${ticker}: ${e.message}`);
            }
        })
    );

    // Process each position
    for (const position of openPositions) {
        try {
            const market = marketDataMap.get(position.marketTicker);
            if (!market) continue;

            const avgEntryPrice = Number(position.avgEntryPrice);
            const netQuantity = Number(position.netQuantity);
            const currentPrice = getCurrentMarketPrice(market, position.side as 'yes' | 'no');

            if (currentPrice === null || netQuantity <= 0) continue;

            const pnlPercent = computeUnrealizedPnLPercent(avgEntryPrice, currentPrice, netQuantity);
            const crossedMilestones = detectCrossedMilestones(pnlPercent);

            // Get already recorded milestones for this position
            const existingMilestones = await prisma.positionMilestone.findMany({
                where: { positionId: position.id },
                select: { milestoneType: true },
            });
            const recordedTypes = new Set(existingMilestones.map(m => m.milestoneType));

            // Find new milestones to record
            const newMilestones = crossedMilestones.filter(m => !recordedTypes.has(m));

            // Create FeedItems for each new milestone
            for (const milestoneType of newMilestones) {
                try {
                    await createMilestoneFeedItem(
                        position.id,
                        position.userId,
                        position.marketTicker,
                        position.eventTicker,
                        position.side,
                        milestoneType,
                        pnlPercent
                    );
                    result.milestonesCreated++;
                } catch (e: any) {
                    // Could be unique constraint violation if concurrent run
                    if (!e.code || e.code !== 'P2002') {
                        result.errors.push(`Milestone creation error: ${e.message}`);
                    }
                }
            }
        } catch (e: any) {
            result.errors.push(`Position ${position.id} error: ${e.message}`);
        }
    }
}

/**
 * Creates a milestone FeedItem atomically with PositionMilestone
 * Uses transaction to ensure both are created or neither
 */
async function createMilestoneFeedItem(
    positionId: string,
    userId: string,
    marketTicker: string,
    eventTicker: string | null,
    side: string,
    milestoneType: MilestoneType,
    pnlPercent: number
): Promise<void> {
    const score = SCORE_WEIGHTS[milestoneType] || 50;

    await prisma.$transaction([
        // 1. Create the deduplication record
        prisma.positionMilestone.create({
            data: {
                positionId,
                milestoneType,
                pnlAtMilestone: pnlPercent,
            },
        }),
        // 2. Create the FeedItem
        prisma.feedItem.create({
            data: {
                type: 'TRADE_MILESTONE',
                userId,
                positionId,
                marketTicker,
                eventTicker,
                side,
                milestoneType,
                milestoneValue: pnlPercent,
                score,
            },
        }),
    ]);
}

/**
 * Indexes recently closed positions that haven't been indexed yet
 */
async function indexClosedPositions(result: IndexingResult): Promise<void> {
    // Find closed positions that don't have a POSITION_CLOSED milestone
    const closedPositions = await prisma.position.findMany({
        where: {
            status: 'CLOSED',
            closedAt: {
                // Only look at positions closed in the last 24 hours
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
        },
        select: {
            id: true,
            userId: true,
            marketTicker: true,
            eventTicker: true,
            side: true,
            realizedPnL: true,
        },
    });

    for (const position of closedPositions) {
        try {
            // Check if already indexed
            const existing = await prisma.positionMilestone.findUnique({
                where: {
                    positionId_milestoneType: {
                        positionId: position.id,
                        milestoneType: 'POSITION_CLOSED',
                    },
                },
            });

            if (existing) continue;

            const realizedPnL = Number(position.realizedPnL);
            const score = SCORE_WEIGHTS.POSITION_CLOSED;

            await prisma.$transaction([
                prisma.positionMilestone.create({
                    data: {
                        positionId: position.id,
                        milestoneType: 'POSITION_CLOSED',
                        pnlAtMilestone: realizedPnL,
                    },
                }),
                prisma.feedItem.create({
                    data: {
                        type: 'POSITION_CLOSED',
                        userId: position.userId,
                        positionId: position.id,
                        marketTicker: position.marketTicker,
                        eventTicker: position.eventTicker,
                        side: position.side,
                        milestoneType: 'POSITION_CLOSED',
                        finalPnL: realizedPnL,
                        score,
                    },
                }),
            ]);

            result.closedPositionsIndexed++;
        } catch (e: any) {
            if (!e.code || e.code !== 'P2002') {
                result.errors.push(`Closed position ${position.id} error: ${e.message}`);
            }
        }
    }
}

/**
 * Promotes high-impact news items to the feed
 */
async function promoteHighImpactNews(result: IndexingResult): Promise<void> {
    // Find recent high-score news that hasn't been promoted yet
    const recentNews = await prisma.eventEvidence.findMany({
        where: {
            highlightScore: { gte: NEWS_HIGHLIGHT_THRESHOLD },
            createdAt: {
                // Look at news from the last 24 hours
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
        },
        orderBy: { highlightScore: 'desc' },
        take: 20,
    });

    for (const news of recentNews) {
        try {
            // Check if already promoted (by evidenceId)
            const existing = await prisma.feedItem.findFirst({
                where: {
                    type: 'NEWS',
                    evidenceId: news.id,
                },
            });

            if (existing) continue;

            await prisma.feedItem.create({
                data: {
                    type: 'NEWS',
                    evidenceId: news.id,
                    marketTicker: news.marketTicker,
                    eventTicker: news.eventTicker,
                    score: SCORE_WEIGHTS.NEWS * news.highlightScore,
                },
            });

            result.newsPromoted++;
        } catch (e: any) {
            result.errors.push(`News promotion ${news.id} error: ${e.message}`);
        }
    }
}
