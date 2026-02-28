/*
  Custom migration to preserve Position ids and Trade.positionId links
  while converting Position.id to UUID and migrating lifecycle fields.
*/

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('OPEN', 'CLOSED');

-- Drop FK + unique index before column changes
ALTER TABLE "Trade" DROP CONSTRAINT IF EXISTS "Trade_positionId_fkey";
DROP INDEX IF EXISTS "Position_userId_marketTicker_side_key";
DROP INDEX IF EXISTS "Trade_positionId_idx";

-- Add new lifecycle columns and UUID staging column
ALTER TABLE "Position"
  ADD COLUMN "id_uuid" UUID,
  ADD COLUMN "avgEntryPrice" DECIMAL(20,10) NOT NULL DEFAULT 0,
  ADD COLUMN "netQuantity" DECIMAL(20,10) NOT NULL DEFAULT 0,
  ADD COLUMN "status_new" "PositionStatus" NOT NULL DEFAULT 'OPEN';

-- Backfill UUIDs
UPDATE "Position" SET "id_uuid" = gen_random_uuid() WHERE "id_uuid" IS NULL;
ALTER TABLE "Position" ALTER COLUMN "id_uuid" SET NOT NULL;

-- Backfill lifecycle fields from legacy aggregates
UPDATE "Position"
SET
  "netQuantity" = COALESCE("totalTokensBought", 0) - COALESCE("totalTokensSold", 0),
  "avgEntryPrice" = CASE
    WHEN COALESCE("totalTokensBought", 0) > 0
      THEN COALESCE("totalCostBasis", 0) / NULLIF("totalTokensBought", 0)
    ELSE 0
  END,
  "status_new" = CASE
    WHEN "status" = 'CLOSED' THEN 'CLOSED'::"PositionStatus"
    ELSE 'OPEN'::"PositionStatus"
  END;

-- Convert realizedPnL to decimal
ALTER TABLE "Position"
  ALTER COLUMN "realizedPnL" TYPE DECIMAL(20,10)
  USING "realizedPnL"::DECIMAL(20,10);

-- Add staging FK on Trade and backfill with new UUIDs
ALTER TABLE "Trade" ADD COLUMN "positionId_uuid" UUID;
UPDATE "Trade" t
SET "positionId_uuid" = p."id_uuid"
FROM "Position" p
WHERE t."positionId" = p."id";

-- Swap Position primary key to UUID
ALTER TABLE "Position" DROP CONSTRAINT "Position_pkey";
ALTER TABLE "Position" DROP COLUMN "id";
ALTER TABLE "Position" RENAME COLUMN "id_uuid" TO "id";
ALTER TABLE "Position" ADD CONSTRAINT "Position_pkey" PRIMARY KEY ("id");

-- Replace status column
ALTER TABLE "Position" DROP COLUMN "status";
ALTER TABLE "Position" RENAME COLUMN "status_new" TO "status";

-- Drop legacy aggregate columns
ALTER TABLE "Position"
  DROP COLUMN "totalCostBasis",
  DROP COLUMN "totalSellProceeds",
  DROP COLUMN "totalTokensBought",
  DROP COLUMN "totalTokensSold";

-- Swap Trade.positionId to UUID
ALTER TABLE "Trade" DROP COLUMN "positionId";
ALTER TABLE "Trade" RENAME COLUMN "positionId_uuid" TO "positionId";

-- Recreate indexes and FK
CREATE INDEX "Position_userId_marketTicker_side_status_idx" ON "Position"("userId", "marketTicker", "side", "status");
CREATE INDEX "Position_status_idx" ON "Position"("status");
CREATE INDEX "Trade_positionId_idx" ON "Trade"("positionId");

ALTER TABLE "Trade"
  ADD CONSTRAINT "Trade_positionId_fkey"
  FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;
