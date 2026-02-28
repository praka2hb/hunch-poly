/*
  Warnings:

  - You are about to drop the column `jupiterPositionPubkey` on the `Trade` table. All the data in the column will be lost.
  - You are about to drop the column `marketIdHash` on the `Trade` table. All the data in the column will be lost.
  - You are about to drop the column `orderPubkey` on the `Trade` table. All the data in the column will be lost.
  - You are about to drop the column `ownerPubkey` on the `Trade` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Trade_jupiterPositionPubkey_idx";

-- DropIndex
DROP INDEX "Trade_orderPubkey_idx";

-- DropIndex
DROP INDEX "Trade_ownerPubkey_idx";

-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "conditionId" TEXT,
ADD COLUMN     "currentPrice" DECIMAL(20,10),
ADD COLUMN     "marketTitle" TEXT,
ADD COLUMN     "noTokenId" TEXT,
ADD COLUMN     "unrealizedPnL" DECIMAL(20,10),
ADD COLUMN     "yesTokenId" TEXT;

-- AlterTable
ALTER TABLE "Trade" DROP COLUMN "jupiterPositionPubkey",
DROP COLUMN "marketIdHash",
DROP COLUMN "orderPubkey",
DROP COLUMN "ownerPubkey",
ADD COLUMN     "conditionId" TEXT,
ADD COLUMN     "feeAmount" DECIMAL(20,10),
ADD COLUMN     "marketTitle" TEXT,
ADD COLUMN     "orderStatus" TEXT,
ADD COLUMN     "tokenId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hasPolymarketApproval" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Position_conditionId_idx" ON "Position"("conditionId");

-- CreateIndex
CREATE INDEX "Trade_conditionId_idx" ON "Trade"("conditionId");

-- CreateIndex
CREATE INDEX "Trade_tokenId_idx" ON "Trade"("tokenId");

-- CreateIndex
CREATE INDEX "Trade_orderStatus_idx" ON "Trade"("orderStatus");
