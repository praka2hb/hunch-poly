/*
  Warnings:

  - You are about to drop the `NewsArticle` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `NewsMarketMatch` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "NewsMarketMatch" DROP CONSTRAINT "NewsMarketMatch_newsArticleId_fkey";

-- DropTable
DROP TABLE "NewsArticle";

-- DropTable
DROP TABLE "NewsMarketMatch";
