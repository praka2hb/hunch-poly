-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "privyId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "followerCount" INTEGER NOT NULL DEFAULT 0,
    "followingCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketTicker" TEXT NOT NULL,
    "eventTicker" TEXT,
    "side" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "transactionSig" TEXT NOT NULL,
    "quote" TEXT,
    "isDummy" BOOLEAN NOT NULL DEFAULT true,
    "entryPrice" DECIMAL(20,10),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopySettings" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "amountPerTrade" DOUBLE PRECISION NOT NULL,
    "maxTotalAmount" DOUBLE PRECISION NOT NULL,
    "usedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "delegationSignature" TEXT,
    "signedMessage" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopyLog" (
    "id" TEXT NOT NULL,
    "leaderTradeId" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "copyTradeId" TEXT,
    "copyAmount" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "skipReason" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopyLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsArticle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "imageUrl" TEXT,
    "author" TEXT,
    "category" TEXT,
    "description" TEXT,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsMarketMatch" (
    "id" TEXT NOT NULL,
    "newsArticleId" TEXT NOT NULL,
    "eventTicker" TEXT,
    "marketTicker" TEXT,
    "relevanceScore" DOUBLE PRECISION NOT NULL,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsMarketMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexedEvent" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndexedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventEvidence" (
    "id" TEXT NOT NULL,
    "eventTicker" TEXT NOT NULL,
    "marketTicker" TEXT NOT NULL,
    "marketQuestion" TEXT NOT NULL,
    "evidenceSentence" TEXT NOT NULL,
    "highlightScore" DOUBLE PRECISION NOT NULL,
    "classification" TEXT NOT NULL,
    "headline" TEXT,
    "explanation" TEXT,
    "sourceUrls" TEXT[],
    "sourceTitles" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_privyId_key" ON "User"("privyId");

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE INDEX "User_privyId_idx" ON "User"("privyId");

-- CreateIndex
CREATE INDEX "User_walletAddress_idx" ON "User"("walletAddress");

-- CreateIndex
CREATE INDEX "Trade_userId_idx" ON "Trade"("userId");

-- CreateIndex
CREATE INDEX "Trade_createdAt_idx" ON "Trade"("createdAt");

-- CreateIndex
CREATE INDEX "Trade_transactionSig_idx" ON "Trade"("transactionSig");

-- CreateIndex
CREATE INDEX "Trade_isDummy_idx" ON "Trade"("isDummy");

-- CreateIndex
CREATE INDEX "Trade_eventTicker_idx" ON "Trade"("eventTicker");

-- CreateIndex
CREATE INDEX "Trade_marketTicker_idx" ON "Trade"("marketTicker");

-- CreateIndex
CREATE INDEX "Follow_followerId_idx" ON "Follow"("followerId");

-- CreateIndex
CREATE INDEX "Follow_followingId_idx" ON "Follow"("followingId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerId_followingId_key" ON "Follow"("followerId", "followingId");

-- CreateIndex
CREATE INDEX "CopySettings_followerId_idx" ON "CopySettings"("followerId");

-- CreateIndex
CREATE INDEX "CopySettings_leaderId_idx" ON "CopySettings"("leaderId");

-- CreateIndex
CREATE UNIQUE INDEX "CopySettings_followerId_leaderId_key" ON "CopySettings"("followerId", "leaderId");

-- CreateIndex
CREATE INDEX "CopyLog_leaderTradeId_idx" ON "CopyLog"("leaderTradeId");

-- CreateIndex
CREATE INDEX "CopyLog_followerId_idx" ON "CopyLog"("followerId");

-- CreateIndex
CREATE INDEX "CopyLog_status_idx" ON "CopyLog"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CopyLog_leaderTradeId_followerId_key" ON "CopyLog"("leaderTradeId", "followerId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsArticle_url_key" ON "NewsArticle"("url");

-- CreateIndex
CREATE INDEX "NewsArticle_publishedAt_idx" ON "NewsArticle"("publishedAt");

-- CreateIndex
CREATE INDEX "NewsArticle_source_idx" ON "NewsArticle"("source");

-- CreateIndex
CREATE INDEX "NewsArticle_category_idx" ON "NewsArticle"("category");

-- CreateIndex
CREATE INDEX "NewsArticle_createdAt_idx" ON "NewsArticle"("createdAt");

-- CreateIndex
CREATE INDEX "NewsMarketMatch_newsArticleId_idx" ON "NewsMarketMatch"("newsArticleId");

-- CreateIndex
CREATE INDEX "NewsMarketMatch_eventTicker_idx" ON "NewsMarketMatch"("eventTicker");

-- CreateIndex
CREATE INDEX "NewsMarketMatch_marketTicker_idx" ON "NewsMarketMatch"("marketTicker");

-- CreateIndex
CREATE INDEX "NewsMarketMatch_relevanceScore_idx" ON "NewsMarketMatch"("relevanceScore");

-- CreateIndex
CREATE INDEX "NewsMarketMatch_matchedAt_idx" ON "NewsMarketMatch"("matchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IndexedEvent_ticker_key" ON "IndexedEvent"("ticker");

-- CreateIndex
CREATE INDEX "IndexedEvent_ticker_idx" ON "IndexedEvent"("ticker");

-- CreateIndex
CREATE INDEX "EventEvidence_eventTicker_idx" ON "EventEvidence"("eventTicker");

-- CreateIndex
CREATE INDEX "EventEvidence_marketTicker_idx" ON "EventEvidence"("marketTicker");

-- CreateIndex
CREATE INDEX "EventEvidence_createdAt_idx" ON "EventEvidence"("createdAt");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopySettings" ADD CONSTRAINT "CopySettings_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopySettings" ADD CONSTRAINT "CopySettings_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsMarketMatch" ADD CONSTRAINT "NewsMarketMatch_newsArticleId_fkey" FOREIGN KEY ("newsArticleId") REFERENCES "NewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
