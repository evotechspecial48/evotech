-- ЭДО СБИС: документ договора и его состояние
ALTER TABLE "Contract" ADD COLUMN "sbisDocumentId" TEXT,
ADD COLUMN "sbisStateCode" TEXT,
ADD COLUMN "sbisStateName" TEXT,
ADD COLUMN "sbisLink" TEXT,
ADD COLUMN "sbisSentAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Contract_sbisDocumentId_key" ON "Contract"("sbisDocumentId");
