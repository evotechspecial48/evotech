-- AlterEnum
ALTER TYPE "TemplateKind" ADD VALUE 'ACT';

-- CreateTable
CREATE TABLE "ClosingDocument" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" INTEGER NOT NULL,
    "actFileId" TEXT,
    "actSource" TEXT,
    "updFileId" TEXT,
    "sbisDocumentId" TEXT,
    "sbisStateCode" TEXT,
    "sbisStateName" TEXT,
    "sbisLink" TEXT,
    "sbisSentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClosingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClosingDocument_number_key" ON "ClosingDocument"("number");

-- CreateIndex
CREATE UNIQUE INDEX "ClosingDocument_projectId_key" ON "ClosingDocument"("projectId");

-- AddForeignKey
ALTER TABLE "ClosingDocument" ADD CONSTRAINT "ClosingDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

