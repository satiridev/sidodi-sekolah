-- AlterTable
ALTER TABLE "upload_sessions" ADD COLUMN     "document_type_id" UUID,
ADD COLUMN     "folder_id" UUID,
ADD COLUMN     "title" TEXT;
