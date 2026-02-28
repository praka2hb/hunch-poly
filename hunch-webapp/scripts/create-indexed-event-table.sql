-- Run this SQL directly against your PostgreSQL database
-- You can use psql, pgAdmin, or any PostgreSQL client

CREATE TABLE IF NOT EXISTS "IndexedEvent" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IndexedEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IndexedEvent_ticker_key" ON "IndexedEvent"("ticker");

CREATE INDEX IF NOT EXISTS "IndexedEvent_ticker_idx" ON "IndexedEvent"("ticker");

