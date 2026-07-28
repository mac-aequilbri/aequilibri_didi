-- AlterTable
ALTER TABLE "plat_core_organisation" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_core_pendingwrite" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_core_assessment" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_core_contact" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_core_job" ADD COLUMN     "airtable_record_id" VARCHAR(20),
ADD COLUMN     "scope_changes_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "plat_core_workstream" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_core_actionhub" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_core_decision" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_core_learningrule" ADD COLUMN     "airtable_record_id" VARCHAR(20),
ADD COLUMN     "application_window" VARCHAR(50) NOT NULL DEFAULT '',
ADD COLUMN     "override_level" VARCHAR(30) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "plat_core_hypothesis" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_core_correction" ADD COLUMN     "airtable_record_id" VARCHAR(20),
ADD COLUMN     "correction_direction" VARCHAR(30) NOT NULL DEFAULT '',
ADD COLUMN     "source_module" VARCHAR(50) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "plat_core_executionlog" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_core_document" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_core_intelligencesnapshot" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_core_chatsession" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_core_chatmessage" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_con_phase" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_con_phaseevidence" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_con_budgetline" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_con_cashflow" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_con_risk" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_con_variationorder" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_con_quote" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_con_quoteline" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_con_vendor" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_con_procurement" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_con_roommatrix" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_con_meetingminutes" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_con_weeklyreport" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_con_bimmodel" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_con_portaltoken" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_con_accountingconnection" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_cfg_teammember" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_cfg_region" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_cfg_reference" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_cfg_nomenclature" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- AlterTable
ALTER TABLE "plat_cfg_setting" ADD COLUMN     "airtable_record_id" VARCHAR(20);

-- CreateTable
CREATE TABLE "plat_core_comms" (
    "id" SERIAL NOT NULL,
    "airtable_record_id" VARCHAR(20),
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER,
    "topic" VARCHAR(300) NOT NULL,
    "message_type" VARCHAR(50) NOT NULL DEFAULT 'Status Update',
    "stakeholder_role" VARCHAR(30) NOT NULL DEFAULT 'Owner',
    "stakeholder_id" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "due_date" DATE,
    "phase_id" INTEGER,
    "linked_issue_id" INTEGER,
    "linked_decision_id" INTEGER,
    "sent_by" VARCHAR(200) NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_core_comms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_con_plantask" (
    "id" SERIAL NOT NULL,
    "airtable_record_id" VARCHAR(20),
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER,
    "task_name" VARCHAR(300) NOT NULL,
    "phase_id" INTEGER,
    "status" VARCHAR(30) NOT NULL DEFAULT 'Not Started',
    "rag" VARCHAR(10) NOT NULL DEFAULT '',
    "start_date" DATE,
    "end_date" DATE,
    "duration_days" INTEGER,
    "assigned_to_id" INTEGER,
    "predecessor_id" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plat_con_plantask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_core_engagementtypeconfig" (
    "id" SERIAL NOT NULL,
    "airtable_record_id" VARCHAR(20),
    "org_id" INTEGER NOT NULL,
    "config_name" VARCHAR(200) NOT NULL DEFAULT '',
    "engagement_type" VARCHAR(30) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "phase_template" TEXT NOT NULL DEFAULT '',
    "plan_view" VARCHAR(30) NOT NULL DEFAULT '',
    "full_risk_register" BOOLEAN NOT NULL DEFAULT false,
    "cashflow_period" VARCHAR(50) NOT NULL DEFAULT '',
    "portfolio_view" BOOLEAN NOT NULL DEFAULT false,
    "tier" VARCHAR(50) NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_core_engagementtypeconfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_ctl_org_registry" (
    "id" SERIAL NOT NULL,
    "airtable_record_id" VARCHAR(20),
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "org_id" INTEGER,
    "vertical" VARCHAR(50) NOT NULL DEFAULT 'construction',
    "default_engagement_type" VARCHAR(30) NOT NULL DEFAULT 'long_project',
    "allowed_engagement_types" TEXT NOT NULL DEFAULT '[]',
    "ai_authority" VARCHAR(30) NOT NULL DEFAULT 'approve_required',
    "settings" TEXT NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "airtable_base_id" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_ctl_org_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_ctl_team" (
    "id" SERIAL NOT NULL,
    "airtable_record_id" VARCHAR(20),
    "org_slug" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(200) NOT NULL DEFAULT '',
    "role" VARCHAR(30) NOT NULL DEFAULT 'member',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_ctl_team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_ctl_assignment" (
    "id" SERIAL NOT NULL,
    "airtable_record_id" VARCHAR(20),
    "org_slug" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "job_rec_id" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_ctl_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_ctl_connection" (
    "id" SERIAL NOT NULL,
    "airtable_record_id" VARCHAR(20),
    "org_slug" VARCHAR(100) NOT NULL,
    "channel" VARCHAR(50) NOT NULL DEFAULT '',
    "direction" VARCHAR(10) NOT NULL DEFAULT 'in',
    "connection_key" VARCHAR(200) NOT NULL DEFAULT '',
    "credential_ref" VARCHAR(200) NOT NULL DEFAULT '',
    "event_filter" VARCHAR(200) NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_event_at" TIMESTAMP(3),
    "last_status" VARCHAR(100) NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_ctl_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_ctl_outbox" (
    "id" SERIAL NOT NULL,
    "airtable_record_id" VARCHAR(20),
    "org_slug" VARCHAR(100) NOT NULL,
    "event" VARCHAR(100) NOT NULL DEFAULT '',
    "entity_type" VARCHAR(50) NOT NULL DEFAULT '',
    "entity_id" VARCHAR(20) NOT NULL DEFAULT '',
    "job_id" VARCHAR(20) NOT NULL DEFAULT '',
    "payload" TEXT NOT NULL DEFAULT '{}',
    "summary" TEXT NOT NULL DEFAULT '',
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT NOT NULL DEFAULT '',
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_ctl_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_ctl_report_catalog" (
    "id" SERIAL NOT NULL,
    "airtable_record_id" VARCHAR(20),
    "org_slug" VARCHAR(100) NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "title" VARCHAR(300) NOT NULL DEFAULT '',
    "prompt" TEXT NOT NULL DEFAULT '',
    "scopes" VARCHAR(200) NOT NULL DEFAULT '',
    "source" VARCHAR(30) NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_ctl_report_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_ctl_template_registry" (
    "id" SERIAL NOT NULL,
    "airtable_record_id" VARCHAR(20),
    "vertical_key" VARCHAR(100) NOT NULL,
    "industry" VARCHAR(100) NOT NULL DEFAULT '',
    "sub_industry" VARCHAR(100) NOT NULL DEFAULT '',
    "template_base_id" VARCHAR(20) NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_ctl_template_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_ctl_job_catalog" (
    "id" SERIAL NOT NULL,
    "airtable_record_id" VARCHAR(20),
    "vertical_key" VARCHAR(100) NOT NULL,
    "engagement_type" VARCHAR(30) NOT NULL DEFAULT '',
    "key" VARCHAR(100) NOT NULL,
    "label" VARCHAR(200) NOT NULL DEFAULT '',
    "category_group" VARCHAR(100) NOT NULL DEFAULT '',
    "phases" TEXT NOT NULL DEFAULT '[]',
    "scope_hint" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "source" VARCHAR(30) NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_ctl_job_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plat_core_comms_airtable_record_id_key" ON "plat_core_comms"("airtable_record_id");

-- CreateIndex
CREATE INDEX "plat_core_comms_org_id_status_idx" ON "plat_core_comms"("org_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "plat_con_plantask_airtable_record_id_key" ON "plat_con_plantask"("airtable_record_id");

-- CreateIndex
CREATE INDEX "plat_con_plantask_org_id_status_idx" ON "plat_con_plantask"("org_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "plat_core_engagementtypeconfig_airtable_record_id_key" ON "plat_core_engagementtypeconfig"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_core_engagementtypeconfig_org_id_engagement_type_key" ON "plat_core_engagementtypeconfig"("org_id", "engagement_type");

-- CreateIndex
CREATE UNIQUE INDEX "plat_ctl_org_registry_airtable_record_id_key" ON "plat_ctl_org_registry"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_ctl_org_registry_slug_key" ON "plat_ctl_org_registry"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "plat_ctl_team_airtable_record_id_key" ON "plat_ctl_team"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_ctl_team_org_slug_email_key" ON "plat_ctl_team"("org_slug", "email");

-- CreateIndex
CREATE UNIQUE INDEX "plat_ctl_assignment_airtable_record_id_key" ON "plat_ctl_assignment"("airtable_record_id");

-- CreateIndex
CREATE INDEX "plat_ctl_assignment_org_slug_email_idx" ON "plat_ctl_assignment"("org_slug", "email");

-- CreateIndex
CREATE UNIQUE INDEX "plat_ctl_connection_airtable_record_id_key" ON "plat_ctl_connection"("airtable_record_id");

-- CreateIndex
CREATE INDEX "plat_ctl_connection_org_slug_is_active_idx" ON "plat_ctl_connection"("org_slug", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "plat_ctl_outbox_airtable_record_id_key" ON "plat_ctl_outbox"("airtable_record_id");

-- CreateIndex
CREATE INDEX "plat_ctl_outbox_org_slug_status_idx" ON "plat_ctl_outbox"("org_slug", "status");

-- CreateIndex
CREATE UNIQUE INDEX "plat_ctl_report_catalog_airtable_record_id_key" ON "plat_ctl_report_catalog"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_ctl_report_catalog_org_slug_key_key" ON "plat_ctl_report_catalog"("org_slug", "key");

-- CreateIndex
CREATE UNIQUE INDEX "plat_ctl_template_registry_airtable_record_id_key" ON "plat_ctl_template_registry"("airtable_record_id");

-- CreateIndex
CREATE INDEX "plat_ctl_template_registry_vertical_key_is_active_idx" ON "plat_ctl_template_registry"("vertical_key", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "plat_ctl_job_catalog_airtable_record_id_key" ON "plat_ctl_job_catalog"("airtable_record_id");

-- CreateIndex
CREATE INDEX "plat_ctl_job_catalog_vertical_key_key_idx" ON "plat_ctl_job_catalog"("vertical_key", "key");

-- CreateIndex
CREATE UNIQUE INDEX "plat_core_organisation_airtable_record_id_key" ON "plat_core_organisation"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_core_pendingwrite_airtable_record_id_key" ON "plat_core_pendingwrite"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_core_assessment_airtable_record_id_key" ON "plat_core_assessment"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_core_contact_airtable_record_id_key" ON "plat_core_contact"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_core_job_airtable_record_id_key" ON "plat_core_job"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_core_workstream_airtable_record_id_key" ON "plat_core_workstream"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_core_actionhub_airtable_record_id_key" ON "plat_core_actionhub"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_core_decision_airtable_record_id_key" ON "plat_core_decision"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_core_learningrule_airtable_record_id_key" ON "plat_core_learningrule"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_core_hypothesis_airtable_record_id_key" ON "plat_core_hypothesis"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_core_correction_airtable_record_id_key" ON "plat_core_correction"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_core_executionlog_airtable_record_id_key" ON "plat_core_executionlog"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_core_document_airtable_record_id_key" ON "plat_core_document"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_core_intelligencesnapshot_airtable_record_id_key" ON "plat_core_intelligencesnapshot"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_core_chatsession_airtable_record_id_key" ON "plat_core_chatsession"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_core_chatmessage_airtable_record_id_key" ON "plat_core_chatmessage"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_con_phase_airtable_record_id_key" ON "plat_con_phase"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_con_phaseevidence_airtable_record_id_key" ON "plat_con_phaseevidence"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_con_budgetline_airtable_record_id_key" ON "plat_con_budgetline"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_con_cashflow_airtable_record_id_key" ON "plat_con_cashflow"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_con_risk_airtable_record_id_key" ON "plat_con_risk"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_con_variationorder_airtable_record_id_key" ON "plat_con_variationorder"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_con_quote_airtable_record_id_key" ON "plat_con_quote"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_con_quoteline_airtable_record_id_key" ON "plat_con_quoteline"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_con_vendor_airtable_record_id_key" ON "plat_con_vendor"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_con_procurement_airtable_record_id_key" ON "plat_con_procurement"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_con_roommatrix_airtable_record_id_key" ON "plat_con_roommatrix"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_con_meetingminutes_airtable_record_id_key" ON "plat_con_meetingminutes"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_con_weeklyreport_airtable_record_id_key" ON "plat_con_weeklyreport"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_con_bimmodel_airtable_record_id_key" ON "plat_con_bimmodel"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_con_portaltoken_airtable_record_id_key" ON "plat_con_portaltoken"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_con_accountingconnection_airtable_record_id_key" ON "plat_con_accountingconnection"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_cfg_teammember_airtable_record_id_key" ON "plat_cfg_teammember"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_cfg_region_airtable_record_id_key" ON "plat_cfg_region"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_cfg_reference_airtable_record_id_key" ON "plat_cfg_reference"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_cfg_nomenclature_airtable_record_id_key" ON "plat_cfg_nomenclature"("airtable_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_cfg_setting_airtable_record_id_key" ON "plat_cfg_setting"("airtable_record_id");

-- AddForeignKey
ALTER TABLE "plat_core_comms" ADD CONSTRAINT "plat_core_comms_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_plantask" ADD CONSTRAINT "plat_con_plantask_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_engagementtypeconfig" ADD CONSTRAINT "plat_core_engagementtypeconfig_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

