/**
 * Simple script to check trade statistics using direct Prisma query
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log('📊 Trade Statistics:');
    console.log('='.repeat(50));

    const totalTrades = await prisma.trade.count();
    console.log(`Total trades: ${totalTrades}`);

    const dummyTrades = await prisma.trade.count({
      where: { isDummy: true }
    });
    console.log(`Dummy trades (isDummy=true): ${dummyTrades}`);

    const realTrades = await prisma.trade.count({
      where: { isDummy: false }
    });
    console.log(`Real trades (isDummy=false): ${realTrades}`);

    if (totalTrades > 0) {
      console.log(`\n✅ Percentage of real trades: ${((realTrades / totalTrades) * 100).toFixed(1)}%`);
      
      // Show a few recent trades
      const recentTrades = await prisma.trade.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          side: true,
          amount: true,
          isDummy: true,
          createdAt: true,
        }
      });

      console.log('\n📝 Recent trades:');
      recentTrades.forEach((trade, idx) => {
        console.log(`  ${idx + 1}. ${trade.side.toUpperCase()} $${trade.amount} - isDummy: ${trade.isDummy} (${trade.createdAt.toISOString().split('T')[0]})`);
      });
    } else {
      console.log('\n⚠️  No trades found in database');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
