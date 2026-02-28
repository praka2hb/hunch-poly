-- AlterTable
ALTER TABLE "User" ADD COLUMN     "delegationMessage" TEXT,
ADD COLUMN     "delegationSignature" TEXT,
ADD COLUMN     "delegationSignedAt" TIMESTAMP(3);
