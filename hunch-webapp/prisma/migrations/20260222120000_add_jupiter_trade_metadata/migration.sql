-- Add Jupiter-specific metadata fields to Trade while keeping Dflow compatibility.
ALTER TABLE "Trade"
ADD COLUMN "source" TEXT,
ADD COLUMN "provider" TEXT,
ADD COLUMN "externalOrderId" TEXT,
ADD COLUMN "orderPubkey" TEXT,
ADD COLUMN "ownerPubkey" TEXT,
ADD COLUMN "jupiterPositionPubkey" TEXT,
ADD COLUMN "marketIdHash" TEXT;

CREATE INDEX "Trade_source_idx" ON "Trade"("source");
CREATE INDEX "Trade_provider_idx" ON "Trade"("provider");
CREATE INDEX "Trade_externalOrderId_idx" ON "Trade"("externalOrderId");
CREATE INDEX "Trade_orderPubkey_idx" ON "Trade"("orderPubkey");
CREATE INDEX "Trade_ownerPubkey_idx" ON "Trade"("ownerPubkey");
CREATE INDEX "Trade_jupiterPositionPubkey_idx" ON "Trade"("jupiterPositionPubkey");
