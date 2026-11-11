-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "isRevision" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "FinanceMonth" (
    "month" TEXT NOT NULL,
    "sro" INTEGER NOT NULL DEFAULT 0,
    "ads" INTEGER NOT NULL DEFAULT 0,
    "adsPlatforms" INTEGER NOT NULL DEFAULT 0,
    "other" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceMonth_pkey" PRIMARY KEY ("month")
);

