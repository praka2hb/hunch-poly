/**
 * Backfill script to migrate existing trades into Position model
 * 
 * This script:
 * 1. Groups existing trades by userId + marketTicker + side
 * 2. Creates Position records for each group
 * 3. Calculates cost basis and realized PnL from historical trades
 * 4. Links trades to their positions
 * 
 * Run with: npx tsx scripts/backfill-positions.ts
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

// Manually read .env to get DIRECT_DATABASE_URL or DATABASE_URL
const envPath = path.resolve(__dirname, '../.env');
let databaseUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const directMatch = envContent.match(/DIRECT_DATABASE_URL="?([^"\n]+)"?/);
    const dbMatch = envContent.match(/DATABASE_URL="?([^"\n]+)"?/);
    if (directMatch) {
        databaseUrl = directMatch[1];
        console.log('Found DIRECT_DATABASE_URL in .env file');
    } else if (dbMatch) {
        databaseUrl = dbMatch[1];
        console.log('Found DATABASE_URL in .env file');
    }
}

if (databaseUrl) {
    databaseUrl = databaseUrl.trim();
}

if (!databaseUrl) {
    console.error('❌ Could not find DIRECT_DATABASE_URL or DATABASE_URL in environment or .env file');
    process.exit(1);
}

// Create Prisma Client configuration (adapter vs Accelerate)
const isAccelerate = databaseUrl.startsWith('prisma://');
const prismaConfig: { adapter?: any; accelerateUrl?: string } = {};

if (isAccelerate) {
    prismaConfig.accelerateUrl = databaseUrl;
} else {
    const pool = new Pool({ connectionString: databaseUrl });
    prismaConfig.adapter = new PrismaPg(pool);
}

const prisma = new PrismaClient(prismaConfig);

const DECIMALS = 1_000_000;

interface TradeGroup {
    userId: string;
    marketTicker: string;
    eventTicker: string | null;
    side: string;
    trades: {
        id: string;
        action: string;
        executedInAmount: string | null;
        executedOutAmount: string | null;
        createdAt: Date;
    }[];
}

async function backfillPositions() {
    console.log('🚀 Starting position backfill...\n');

    // Fetch all real trades
    const allTrades = await prisma.trade.findMany({
        where: {},
        orderBy: { createdAt: 'asc' },
        select: {
            id: true,
            userId: true,
            marketTicker: true,
            eventTicker: true,
            side: true,
            action: true,
            executedInAmount: true,
            executedOutAmount: true,
            createdAt: true,
            positionId: true,
        },
    });

    console.log(`📊 Found ${allTrades.length} total trades\n`);

    // Group trades by userId + marketTicker + side
    const tradeGroups = new Map<string, TradeGroup>();

    for (const trade of allTrades) {
        const key = `${trade.userId}-${trade.marketTicker}-${trade.side}`;

        if (!tradeGroups.has(key)) {
            tradeGroups.set(key, {
                userId: trade.userId,
                marketTicker: trade.marketTicker,
                eventTicker: trade.eventTicker,
                side: trade.side,
                trades: [],
            });
        }

        tradeGroups.get(key)!.trades.push({
            id: trade.id,
            action: trade.action,
            executedInAmount: trade.executedInAmount,
            executedOutAmount: trade.executedOutAmount,
            createdAt: trade.createdAt,
        });
    }

    console.log(`📦 Found ${tradeGroups.size} unique positions to create\n`);

    let created = 0;
    let closed = 0;
    let tradesLinked = 0;
    let skippedTrades = 0;

    const EPSILON = 1e-9;

    for (const [key, group] of tradeGroups) {
        let currentPositionId: string | null = null;
        let netQuantity = 0;
        let avgEntryPrice = 0;
        let realizedPnL = 0;

        for (const trade of group.trades) {
            if (trade.action === 'BUY') {
                const usdcSpent = trade.executedInAmount ? Number(trade.executedInAmount) / DECIMALS : 0;
                const tokensReceived = trade.executedOutAmount ? Number(trade.executedOutAmount) / DECIMALS : 0;

                if (usdcSpent <= 0 || tokensReceived <= 0) {
                    skippedTrades++;
                    continue;
                }

                if (!currentPositionId || netQuantity <= EPSILON) {
                    const position = await prisma.position.create({
                        data: {
                            userId: group.userId,
                            marketTicker: group.marketTicker,
                            eventTicker: group.eventTicker,
                            side: group.side,
                            status: 'OPEN',
                            openedAt: trade.createdAt,
                            avgEntryPrice: 0,
                            netQuantity: 0,
                            realizedPnL: 0,
                        },
                        select: { id: true },
                    });
                    currentPositionId = position.id;
                    netQuantity = 0;
                    avgEntryPrice = 0;
                    realizedPnL = 0;
                    created++;
                }

                const newQty = netQuantity + tokensReceived;
                const newAvg = newQty > 0 ? (avgEntryPrice * netQuantity + usdcSpent) / newQty : avgEntryPrice;

                netQuantity = newQty;
                avgEntryPrice = newAvg;

                await prisma.position.update({
                    where: { id: currentPositionId },
                    data: {
                        netQuantity,
                        avgEntryPrice,
                        status: 'OPEN',
                        closedAt: null,
                    },
                });

                await prisma.trade.update({
                    where: { id: trade.id },
                    data: { positionId: currentPositionId },
                });
                tradesLinked++;
            } else if (trade.action === 'SELL') {
                if (!currentPositionId || netQuantity <= EPSILON) {
                    skippedTrades++;
                    continue;
                }

                const tokensSoldRaw = trade.executedInAmount ? Number(trade.executedInAmount) / DECIMALS : 0;
                const usdcReceivedRaw = trade.executedOutAmount ? Number(trade.executedOutAmount) / DECIMALS : 0;

                if (tokensSoldRaw <= 0 || usdcReceivedRaw <= 0) {
                    skippedTrades++;
                    continue;
                }

                const tokensSold = Math.min(tokensSoldRaw, netQuantity);
                const usdcReceived = tokensSoldRaw > 0
                    ? usdcReceivedRaw * (tokensSold / tokensSoldRaw)
                    : usdcReceivedRaw;

                const costBasisSold = avgEntryPrice * tokensSold;
                realizedPnL += usdcReceived - costBasisSold;
                netQuantity -= tokensSold;

                const isClosed = netQuantity <= EPSILON;

                await prisma.position.update({
                    where: { id: currentPositionId },
                    data: {
                        netQuantity: isClosed ? 0 : netQuantity,
                        avgEntryPrice,
                        realizedPnL,
                        status: isClosed ? 'CLOSED' : 'OPEN',
                        closedAt: isClosed ? trade.createdAt : null,
                    },
                });

                await prisma.trade.update({
                    where: { id: trade.id },
                    data: { positionId: currentPositionId },
                });
                tradesLinked++;

                if (isClosed) {
                    closed++;
                    currentPositionId = null;
                    netQuantity = 0;
                    avgEntryPrice = 0;
                    realizedPnL = 0;
                }
            }
        }

        console.log(`  ✅ ${group.marketTicker} (${group.side}): ${group.trades.length} trades processed`);
    }

    console.log('\n📊 Backfill Summary:');
    console.log(`  - Positions created: ${created}`);
    console.log(`  - Positions closed: ${closed}`);
    console.log(`  - Trades linked: ${tradesLinked}`);
    console.log(`  - Trades skipped: ${skippedTrades}`);
    console.log('\n✨ Backfill complete!');
}

backfillPositions()
    .catch((e) => {
        console.error('❌ Backfill failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
