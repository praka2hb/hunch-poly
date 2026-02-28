/*
  Warnings:

  - You are about to drop the column `delegationMessage` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `delegationSignature` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `delegationSignedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `hasPolymarketApproval` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "walletAddress" TEXT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "delegationMessage",
DROP COLUMN "delegationSignature",
DROP COLUMN "delegationSignedAt",
DROP COLUMN "hasPolymarketApproval",
ADD COLUMN     "clobApiKey" TEXT,
ADD COLUMN     "clobApiPassphrase" TEXT,
ADD COLUMN     "clobApiSecret" TEXT;
