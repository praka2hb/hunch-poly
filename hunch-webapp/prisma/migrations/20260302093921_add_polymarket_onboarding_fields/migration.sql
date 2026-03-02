-- AlterTable
ALTER TABLE "User" ADD COLUMN     "approvalsSet" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "polymarketCredentialsCreatedAt" TIMESTAMP(3),
ADD COLUMN     "polymarketOnboardingStep" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "safeAddress" TEXT,
ADD COLUMN     "safeDeployed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "User_polymarketOnboardingStep_idx" ON "User"("polymarketOnboardingStep");
