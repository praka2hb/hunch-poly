/**
 * Script to create IndexedEvent table manually
 * This works with Prisma Accelerate since it uses raw SQL
 */
import { prisma } from '../app/lib/db.js';

async function createIndexedEventTable() {
  try {
    console.log('Creating IndexedEvent table...');
    
    // Create table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "IndexedEvent" (
        "id" TEXT NOT NULL,
        "ticker" TEXT NOT NULL,
        "source" TEXT NOT NULL DEFAULT 'manual',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "IndexedEvent_pkey" PRIMARY KEY ("id")
      );
    `);

    // Create unique index on ticker
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IndexedEvent_ticker_key" ON "IndexedEvent"("ticker");
    `);

    // Create regular index on ticker
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "IndexedEvent_ticker_idx" ON "IndexedEvent"("ticker");
    `);

    console.log('✅ IndexedEvent table created successfully!');
  } catch (error) {
    console.error('❌ Error creating table:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createIndexedEventTable();

