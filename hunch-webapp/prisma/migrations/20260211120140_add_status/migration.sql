/*
  Warnings:

  - A unique constraint covering the columns `[normalizedUsername]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "OnboardingStep" AS ENUM ('LINK_X', 'USERNAME', 'INTERESTS', 'SUGGESTED_FOLLOWERS', 'COMPLETE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authProvider" TEXT,
ADD COLUMN     "hasCompletedOnboarding" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasLinkedX" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "normalizedUsername" TEXT,
ADD COLUMN     "onboardingStep" "OnboardingStep" NOT NULL DEFAULT 'LINK_X',
ADD COLUMN     "onboardingUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "username" TEXT,
ADD COLUMN     "walletReady" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "User_normalizedUsername_key" ON "User"("normalizedUsername");

-- CreateIndex
CREATE INDEX "User_onboardingStep_idx" ON "User"("onboardingStep");

-- CreateIndex
CREATE INDEX "User_hasCompletedOnboarding_idx" ON "User"("hasCompletedOnboarding");
