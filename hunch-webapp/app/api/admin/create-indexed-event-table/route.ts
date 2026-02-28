import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';

/**
 * One-time endpoint to create IndexedEvent table
 * Call this once: GET /api/admin/create-indexed-event-table
 * Works with Prisma Accelerate since it uses raw SQL
 */
export async function GET(request: NextRequest) {
  try {
    // Optional: Add a simple auth check (e.g., check for a secret token)
    const authToken = request.nextUrl.searchParams.get('token');
    const expectedToken = process.env.ADMIN_TOKEN || 'dev-token';
    
    if (authToken !== expectedToken) {
      return NextResponse.json(
        { error: 'Unauthorized. Provide ?token=your-admin-token' },
        { status: 401 }
      );
    }

    console.log('[Admin] Creating IndexedEvent table...');

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

    console.log('[Admin] ✅ IndexedEvent table created successfully!');

    return NextResponse.json({
      success: true,
      message: 'IndexedEvent table created successfully',
    });
  } catch (error: any) {
    console.error('[Admin] ❌ Error creating table:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to create table',
        details: error.toString(),
      },
      { status: 500 }
    );
  }
}

