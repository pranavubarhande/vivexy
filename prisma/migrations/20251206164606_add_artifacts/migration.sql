-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('MD', 'HTML', 'JS', 'TXT');

-- CreateTable
CREATE TABLE "artifacts" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" TEXT,
    "title" TEXT,
    "type" "ArtifactType" NOT NULL,
    "filename" TEXT,
    "language" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "seq" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "artifacts_chatId_seq_idx" ON "artifacts"("chatId", "seq");

-- CreateIndex
CREATE INDEX "artifacts_chatId_version_idx" ON "artifacts"("chatId", "version");

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
