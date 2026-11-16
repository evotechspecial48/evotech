-- CreateTable
CREATE TABLE "MetrikaConversion" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "price" INTEGER,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetrikaConversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetrikaConversion_sentAt_idx" ON "MetrikaConversion"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "MetrikaConversion_leadId_goal_key" ON "MetrikaConversion"("leadId", "goal");

