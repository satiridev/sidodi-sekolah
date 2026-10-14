-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "retention_auto_enqueue" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "retention_notifications" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "rule_id" UUID,
    "stage" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "document_expires_at" TIMESTAMPTZ,
    "recipient_roles" TEXT[] DEFAULT ARRAY['headmaster', 'head_of_administration']::TEXT[],
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "retention_notifications_school_id_status_idx" ON "retention_notifications"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "retention_notifications_document_id_stage_key" ON "retention_notifications"("document_id", "stage");

-- AddForeignKey
ALTER TABLE "retention_notifications" ADD CONSTRAINT "retention_notifications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_notifications" ADD CONSTRAINT "retention_notifications_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_notifications" ADD CONSTRAINT "retention_notifications_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "retention_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
