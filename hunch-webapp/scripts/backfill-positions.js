/**
 * Backfill script to migrate existing trades into Position model
 * 
 * Run with: node scripts/backfill-positions.js
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

// Manually read .env to get DATABASE_URL or DIRECT_DATABASE_URL
const envPath = path.resolve(__dirname, '../.env');
let databaseUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

if (fs.existsSync(envPath) && !databaseUrl) {
    const envContent = fs.readFileSync(envPath, 'utf8');

    // Try to find DIRECT_DATABASE_URL first
    let match = envContent.match(/DIRECT_DATABASE_URL="?([^"\n]+)"?/);
    if (match) {
        databaseUrl = match[1];
        console.log('Found DIRECT_DATABASE_URL in .env file');
    } else {
        // Fallback to DATABASE_URL
        match = envContent.match(/DATABASE_URL="?([^"\n]+)"?/);
        if (match) {
            databaseUrl = match[1];
            console.log('Found DATABASE_URL in .env file');
        }
    }
}

if (!databaseUrl) {
    console.error('❌ Could not find DATABASE_URL or DIRECT_DATABASE_URL in environment or .env file');
    process.exit(1);
}

// Ensure the URL is valid for standard Prisma (e.g. modify headers if needed, but usually fine)
// Set env var so Prisma picks it up automatically - this is the most reliable method
process.env.DATABASE_URL = databaseUrl;

console.log('Initializing standard Prisma Client...');
const prisma = new PrismaClient();

const DECIMALS = 1_000_000;

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
    const tradeGroups = new Map();

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

        tradeGroups.get(key).trades.push({
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
        let currentPositionId = null;
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
