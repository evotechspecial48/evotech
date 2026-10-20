-- AlterEnum
ALTER TYPE "LeadSource" ADD VALUE 'avito';

-- AlterTable
ALTER TABLE "ProjectMember" ADD COLUMN     "advance" INTEGER,
ADD COLUMN     "fee" INTEGER;
