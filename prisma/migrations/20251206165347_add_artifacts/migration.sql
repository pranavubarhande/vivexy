-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ArtifactType" ADD VALUE 'JSON';
ALTER TYPE "ArtifactType" ADD VALUE 'CSV';

-- DropIndex
DROP INDEX "public"."artifacts_chatId_seq_idx";

-- DropIndex
DROP INDEX "public"."artifacts_chatId_version_idx";
