-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "positionId" TEXT;

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketTicker" TEXT NOT NULL,
    "eventTicker" TEXT,
    "side" TEXT NOT NULL,
    "totalCostBasis" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTokensBought" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTokensSold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSellProceeds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "realizedPnL" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Position_userId_idx" ON "Position"("userId");

-- CreateIndex
CREATE INDEX "Position_marketTicker_idx" ON "Position"("marketTicker");

-- CreateIndex
CREATE INDEX "Position_status_idx" ON "Position"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Position_userId_marketTicker_side_key" ON "Position"("userId", "marketTicker", "side");

-- CreateIndex
CREATE INDEX "Trade_positionId_idx" ON "Trade"("positionId");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
