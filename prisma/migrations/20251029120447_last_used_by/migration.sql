-- AlterTable
ALTER TABLE "chats" ADD COLUMN     "lastModelId" TEXT;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_lastModelId_fkey" FOREIGN KEY ("lastModelId") REFERENCES "llm_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
