-- CreateTable
CREATE TABLE "plat_core_pendingwrite" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER,
    "table_key" VARCHAR(50) NOT NULL,
    "op" VARCHAR(10) NOT NULL,
    "record_id" INTEGER,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "actor_type" VARCHAR(20) NOT NULL DEFAULT 'ai',
    "actor_name" VARCHAR(200) NOT NULL DEFAULT '',
    "source_message_id" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'proposed',
    "resolved_by" VARCHAR(200) NOT NULL DEFAULT '',
    "resolved_at" TIMESTAMP(3),
    "exec_log_id" INTEGER,
    "error" TEXT NOT NULL DEFAULT '',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_core_pendingwrite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_core_assessment" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "engagement_type" VARCHAR(30) NOT NULL DEFAULT 'long_project',
    "address" VARCHAR(400) NOT NULL DEFAULT '',
    "suburb" VARCHAR(100) NOT NULL DEFAULT '',
    "size_sqm" DOUBLE PRECISION,
    "scope" TEXT NOT NULL DEFAULT '',
    "result" TEXT NOT NULL DEFAULT '{}',
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "job_id" INTEGER,
    "prompt_version" VARCHAR(50) NOT NULL DEFAULT '',
    "created_by" VARCHAR(200) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_core_assessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plat_core_pendingwrite_org_id_status_idx" ON "plat_core_pendingwrite"("org_id", "status");

-- CreateIndex
CREATE INDEX "plat_core_assessment_org_id_status_idx" ON "plat_core_assessment"("org_id", "status");

-- AddForeignKey
ALTER TABLE "plat_core_pendingwrite" ADD CONSTRAINT "plat_core_pendingwrite_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_assessment" ADD CONSTRAINT "plat_core_assessment_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

