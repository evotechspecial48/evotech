-- AlterEnum
ALTER TYPE "TemplateKind" ADD VALUE 'SPECIFICATION';

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "specNumber" INTEGER;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

