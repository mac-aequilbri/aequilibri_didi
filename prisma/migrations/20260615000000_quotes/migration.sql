-- CreateTable
CREATE TABLE "plat_con_quote" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER NOT NULL,
    "ref_number" VARCHAR(30) NOT NULL DEFAULT '',
    "title" VARCHAR(300) NOT NULL,
    "client_name" VARCHAR(200) NOT NULL DEFAULT '',
    "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "gst_rate" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "valid_until" DATE,
    "is_ai_drafted" BOOLEAN NOT NULL DEFAULT false,
    "created_by" VARCHAR(200) NOT NULL DEFAULT '',
    "sent_at" TIMESTAMP(3),
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plat_con_quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_con_quoteline" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "quote_id" INTEGER NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "category" VARCHAR(100) NOT NULL DEFAULT '',
    "qty" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "unit" VARCHAR(20) NOT NULL DEFAULT 'item',
    "unit_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_con_quoteline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plat_con_quote_job_id_status_idx" ON "plat_con_quote"("job_id", "status");

-- CreateIndex
CREATE INDEX "plat_con_quoteline_quote_id_sort_order_idx" ON "plat_con_quoteline"("quote_id", "sort_order");

-- AddForeignKey
ALTER TABLE "plat_con_quote" ADD CONSTRAINT "plat_con_quote_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_quote" ADD CONSTRAINT "plat_con_quote_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "plat_core_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_quoteline" ADD CONSTRAINT "plat_con_quoteline_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_quoteline" ADD CONSTRAINT "plat_con_quoteline_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "plat_con_quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
