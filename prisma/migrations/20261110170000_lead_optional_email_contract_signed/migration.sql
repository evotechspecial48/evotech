-- Заявки по телефону — без почты
ALTER TABLE "Lead" ALTER COLUMN "email" DROP NOT NULL;

-- Статус «Квалификация» убран: такие заявки возвращаются в «Новые»,
-- значение перечисления переименовывается в «Договор подписан» (contract_signed)
UPDATE "Lead" SET "status" = 'new' WHERE "status" = 'qualification';
ALTER TYPE "LeadStatus" RENAME VALUE 'qualification' TO 'contract_signed';
