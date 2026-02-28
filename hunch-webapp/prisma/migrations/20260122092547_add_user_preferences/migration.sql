-- AlterTable
ALTER TABLE "User" ADD COLUMN     "preferences" TEXT[] DEFAULT ARRAY[]::TEXT[];
