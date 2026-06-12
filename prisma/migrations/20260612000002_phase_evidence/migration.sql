-- AlterTable
ALTER TABLE "plat_con_phase" ADD COLUMN     "evidence_suggestion" TEXT NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "plat_con_phaseevidence" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER NOT NULL,
    "phase_id" INTEGER NOT NULL,
    "document_id" INTEGER NOT NULL,
    "note" VARCHAR(300) NOT NULL DEFAULT '',
    "added_by" VARCHAR(200) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_con_phaseevidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plat_con_phaseevidence_job_id_idx" ON "plat_con_phaseevidence"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_con_phaseevidence_phase_id_document_id_key" ON "plat_con_phaseevidence"("phase_id", "document_id");

-- AddForeignKey
ALTER TABLE "plat_con_phaseevidence" ADD CONSTRAINT "plat_con_phaseevidence_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_phaseevidence" ADD CONSTRAINT "plat_con_phaseevidence_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "plat_core_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_phaseevidence" ADD CONSTRAINT "plat_con_phaseevidence_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "plat_con_phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_phaseevidence" ADD CONSTRAINT "plat_con_phaseevidence_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "plat_core_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
