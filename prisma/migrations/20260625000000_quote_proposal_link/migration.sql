-- A quote can now be a PROPOSAL that exists before any project: an assessment
-- is turned into a proposal (generateProposalFromAssessment), and the managed
-- project is only materialized when the proposal is accepted (acceptProposal).
-- So job_id becomes nullable (backfilled on acceptance) and assessment_id
-- records the source assessment. The existing job_id FK (ON DELETE CASCADE)
-- stays valid for a nullable column. assessment_id is a bare scalar (no FK),
-- mirroring plat_core_assessment.job_id.

-- AlterTable
ALTER TABLE "plat_con_quote" ALTER COLUMN "job_id" DROP NOT NULL;
ALTER TABLE "plat_con_quote" ADD COLUMN "assessment_id" INTEGER;

-- CreateIndex
CREATE INDEX "plat_con_quote_org_id_assessment_id_idx" ON "plat_con_quote"("org_id", "assessment_id");
