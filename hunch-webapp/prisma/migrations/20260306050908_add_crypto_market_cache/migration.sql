-- CreateTable
CREATE TABLE "CryptoMarketCache" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "openingPrice" DOUBLE PRECISION NOT NULL,
    "openTime" BIGINT NOT NULL,
    "closeTime" BIGINT NOT NULL,
    "isAccurate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CryptoMarketCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CryptoMarketCache_slug_key" ON "CryptoMarketCache"("slug");

-- CreateIndex
CREATE INDEX "CryptoMarketCache_asset_interval_idx" ON "CryptoMarketCache"("asset", "interval");

-- CreateIndex
CREATE INDEX "CryptoMarketCache_createdAt_idx" ON "CryptoMarketCache"("createdAt");
