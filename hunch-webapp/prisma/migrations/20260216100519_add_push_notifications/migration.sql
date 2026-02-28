-- AlterTable
ALTER TABLE "User" ADD COLUMN     "expoPushToken" TEXT,
ADD COLUMN     "tradeNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
