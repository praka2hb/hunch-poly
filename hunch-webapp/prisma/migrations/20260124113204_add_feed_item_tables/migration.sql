-- CreateEnum
CREATE TYPE "FeedItemType" AS ENUM ('TRADE_MILESTONE', 'POSITION_CLOSED', 'NEWS');

-- CreateEnum
CREATE TYPE "MilestoneType" AS ENUM ('PNL_PLUS_5', 'PNL_PLUS_10', 'PNL_PLUS_20', 'PNL_MINUS_5', 'PNL_MINUS_10', 'POSITION_CLOSED');

-- CreateTable
CREATE TABLE "FeedItem" (
    "id" TEXT NOT NULL,
    "type" "FeedItemType" NOT NULL,
    "userId" TEXT,
    "positionId" UUID,
    "tradeId" TEXT,
    "evidenceId" TEXT,
    "marketTicker" TEXT NOT NULL,
    "eventTicker" TEXT,
    "side" TEXT,
    "milestoneType" "MilestoneType",
    "milestoneValue" DOUBLE PRECISION,
    "finalPnL" DOUBLE PRECISION,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionMilestone" (
    "id" TEXT NOT NULL,
    "positionId" UUID NOT NULL,
    "milestoneType" "MilestoneType" NOT NULL,
    "reachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pnlAtMilestone" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PositionMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedItem_userId_createdAt_idx" ON "FeedItem"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "FeedItem_type_idx" ON "FeedItem"("type");

-- CreateIndex
CREATE INDEX "FeedItem_score_createdAt_idx" ON "FeedItem"("score", "createdAt");

-- CreateIndex
CREATE INDEX "FeedItem_marketTicker_idx" ON "FeedItem"("marketTicker");

-- CreateIndex
CREATE INDEX "FeedItem_createdAt_idx" ON "FeedItem"("createdAt");

-- CreateIndex
CREATE INDEX "PositionMilestone_positionId_idx" ON "PositionMilestone"("positionId");

-- CreateIndex
CREATE UNIQUE INDEX "PositionMilestone_positionId_milestoneType_key" ON "PositionMilestone"("positionId", "milestoneType");

-- AddForeignKey
ALTER TABLE "FeedItem" ADD CONSTRAINT "FeedItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
