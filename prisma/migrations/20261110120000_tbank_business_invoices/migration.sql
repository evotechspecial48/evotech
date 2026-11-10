-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "fileId" TEXT,
ADD COLUMN     "kind" TEXT,
ADD COLUMN     "number" SERIAL NOT NULL,
ADD COLUMN     "qrImage" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_number_key" ON "Payment"("number");

