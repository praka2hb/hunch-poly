-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "action" TEXT NOT NULL DEFAULT 'BUY';

-- CreateIndex
CREATE INDEX "Trade_action_idx" ON "Trade"("action");
