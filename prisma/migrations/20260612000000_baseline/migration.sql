-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "uc1_roofing_contact" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" VARCHAR(30) NOT NULL DEFAULT '',
    "company" VARCHAR(200) NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uc1_roofing_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_ratecard" (
    "id" SERIAL NOT NULL,
    "material" VARCHAR(50) NOT NULL,
    "pitch_type" VARCHAR(20) NOT NULL,
    "description" VARCHAR(300) NOT NULL DEFAULT '',
    "unit" VARCHAR(20) NOT NULL DEFAULT 'mÂ²',
    "rate_ex_gst" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uc1_roofing_ratecard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_quote" (
    "id" SERIAL NOT NULL,
    "ref_number" VARCHAR(20) NOT NULL,
    "contact_id" INTEGER,
    "property_address" TEXT NOT NULL,
    "flat_area_sqm" DECIMAL(10,2) NOT NULL,
    "pitch_type" VARCHAR(20) NOT NULL DEFAULT 'standard',
    "waste_factor_pct" DECIMAL(5,1) NOT NULL DEFAULT 10.0,
    "material" VARCHAR(50) NOT NULL DEFAULT 'colorbond',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "roof_polygon_json" TEXT,
    "roof_sections_json" TEXT,
    "eave_lm" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "perimeter_m" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "ridge_lm" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "valley_lm" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "hip_lm" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "rake_lm" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "pitch_deg_actual" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "storeys" SMALLINT NOT NULL DEFAULT 1,
    "roof_colour" VARCHAR(60) NOT NULL DEFAULT '',
    "detected_equipment_json" TEXT,
    "pricing_mechanism" VARCHAR(20) NOT NULL DEFAULT 'cost_plus',
    "pricing_mode" VARCHAR(20) NOT NULL DEFAULT '',
    "package_tier" VARCHAR(20) NOT NULL DEFAULT '',
    "markup_pct" DECIMAL(5,4) NOT NULL DEFAULT 0.10,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uc1_roofing_quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_quoteitem" (
    "id" SERIAL NOT NULL,
    "quote_id" INTEGER NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit" VARCHAR(20) NOT NULL DEFAULT 'mÂ²',
    "unit_price_ex_gst" DECIMAL(10,2) NOT NULL,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "uc1_roofing_quoteitem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_roofpolygon" (
    "id" SERIAL NOT NULL,
    "quote_id" INTEGER,
    "coordinates_json" TEXT NOT NULL DEFAULT '[]',
    "detection_path" VARCHAR(50) NOT NULL DEFAULT '',
    "confidence" VARCHAR(20) NOT NULL DEFAULT '',
    "area_sqm_raw" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uc1_roofing_roofpolygon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_buildingfootprint" (
    "id" SERIAL NOT NULL,
    "min_lat" DOUBLE PRECISION NOT NULL,
    "max_lat" DOUBLE PRECISION NOT NULL,
    "min_lon" DOUBLE PRECISION NOT NULL,
    "max_lon" DOUBLE PRECISION NOT NULL,
    "centroid_lat" DOUBLE PRECISION NOT NULL,
    "centroid_lon" DOUBLE PRECISION NOT NULL,
    "area_sqm" DOUBLE PRECISION NOT NULL,
    "geometry" TEXT NOT NULL,

    CONSTRAINT "uc1_roofing_buildingfootprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_footprinttilecache" (
    "quadkey" VARCHAR(32) NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uc1_roofing_footprinttilecache_pkey" PRIMARY KEY ("quadkey")
);

-- CreateTable
CREATE TABLE "uc1_roofing_pricechecklog" (
    "id" SERIAL NOT NULL,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(20) NOT NULL DEFAULT 'success',
    "vendors_checked" SMALLINT NOT NULL DEFAULT 0,
    "prices_updated" SMALLINT NOT NULL DEFAULT 0,
    "prices_unchanged" SMALLINT NOT NULL DEFAULT 0,
    "errors" SMALLINT NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL DEFAULT '',
    "raw_log" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "uc1_roofing_pricechecklog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_vendor" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "contact_name" VARCHAR(200) NOT NULL DEFAULT '',
    "contact_email" TEXT NOT NULL DEFAULT '',
    "contact_phone" VARCHAR(30) NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "suburb" VARCHAR(100) NOT NULL DEFAULT '',
    "state" VARCHAR(10) NOT NULL DEFAULT 'QLD',
    "notes" TEXT NOT NULL DEFAULT '',
    "is_preferred" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uc1_roofing_vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_vendormaterialprice" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "material" VARCHAR(50) NOT NULL,
    "item_code" VARCHAR(50) NOT NULL DEFAULT '',
    "description" VARCHAR(300) NOT NULL,
    "unit" VARCHAR(20) NOT NULL DEFAULT 'mÂ²',
    "unit_price_ex_gst" DECIMAL(10,2) NOT NULL,
    "lead_days" SMALLINT NOT NULL DEFAULT 3,
    "price_source_url" TEXT NOT NULL DEFAULT '',
    "previous_price" DECIMAL(10,2),
    "last_verified" TIMESTAMP(3),
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uc1_roofing_vendormaterialprice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_purchaseorder" (
    "id" SERIAL NOT NULL,
    "po_number" VARCHAR(20) NOT NULL,
    "quote_id" INTEGER,
    "vendor_id" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "delivery_address" TEXT NOT NULL DEFAULT '',
    "requested_delivery_date" DATE,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uc1_roofing_purchaseorder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_purchaseorderitem" (
    "id" SERIAL NOT NULL,
    "purchase_order_id" INTEGER NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "item_code" VARCHAR(50) NOT NULL DEFAULT '',
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit" VARCHAR(20) NOT NULL DEFAULT 'mÂ²',
    "unit_price_ex_gst" DECIMAL(10,2) NOT NULL,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "uc1_roofing_purchaseorderitem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_rooflidaranalysis" (
    "id" SERIAL NOT NULL,
    "quote_id" INTEGER NOT NULL,
    "perimeter_m" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "guttering_linear_m" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ridge_height_m" DOUBLE PRECISION,
    "eave_height_m" DOUBLE PRECISION,
    "height_range_m" DOUBLE PRECISION,
    "scaffolding_required" BOOLEAN NOT NULL DEFAULT false,
    "scaffolding_linear_m" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scaffolding_risk_level" VARCHAR(10) NOT NULL DEFAULT 'low',
    "scaffolding_reason" VARCHAR(200) NOT NULL DEFAULT '',
    "structure_count" SMALLINT NOT NULL DEFAULT 1,
    "structures_json" TEXT NOT NULL DEFAULT '[]',
    "solar_panels" BOOLEAN NOT NULL DEFAULT false,
    "solar_hw" BOOLEAN NOT NULL DEFAULT false,
    "lidar_coverage" VARCHAR(20) NOT NULL DEFAULT 'none',
    "data_source" VARCHAR(50) NOT NULL DEFAULT '',
    "analysis_notes" TEXT NOT NULL DEFAULT '',
    "elapsed_ms" INTEGER NOT NULL DEFAULT 0,
    "analyzed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uc1_roofing_rooflidaranalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_executionlog" (
    "id" SERIAL NOT NULL,
    "tool_name" VARCHAR(100) NOT NULL,
    "payload" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'success',
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "quote_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uc1_roofing_executionlog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_gutteringrate" (
    "id" SERIAL NOT NULL,
    "item_type" VARCHAR(30) NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "unit" VARCHAR(20) NOT NULL DEFAULT 'lm',
    "rate_ex_gst" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uc1_roofing_gutteringrate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_solarpartner" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "contact_name" VARCHAR(200) NOT NULL DEFAULT '',
    "contact_email" TEXT NOT NULL DEFAULT '',
    "contact_phone" VARCHAR(30) NOT NULL DEFAULT '',
    "referral_fee_pct" DECIMAL(5,2) NOT NULL DEFAULT 10.0,
    "avg_install_value" DECIMAL(10,2) NOT NULL DEFAULT 10000,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uc1_roofing_solarpartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_solarreferral" (
    "id" SERIAL NOT NULL,
    "quote_id" INTEGER NOT NULL,
    "partner_id" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "solar_potential_kwh" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "best_section_area" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "best_section_facing" VARCHAR(20) NOT NULL DEFAULT '',
    "estimated_capacity_kw" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimated_install_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "estimated_referral_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "client_notes" TEXT NOT NULL DEFAULT '',
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uc1_roofing_solarreferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_financeprovider" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(30) NOT NULL,
    "interest_rate_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "min_term_months" INTEGER NOT NULL DEFAULT 12,
    "max_term_months" INTEGER NOT NULL DEFAULT 60,
    "min_amount" DECIMAL(10,2) NOT NULL DEFAULT 1000,
    "tagline" VARCHAR(200) NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uc1_roofing_financeprovider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_stormevent" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "event_type" VARCHAR(20) NOT NULL DEFAULT 'hail',
    "event_date" DATE NOT NULL,
    "severity" INTEGER NOT NULL DEFAULT 3,
    "affected_suburbs" TEXT NOT NULL,
    "state" VARCHAR(10) NOT NULL DEFAULT 'QLD',
    "notes" TEXT NOT NULL DEFAULT '',
    "leads_generated" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uc1_roofing_stormevent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_stormlead" (
    "id" SERIAL NOT NULL,
    "storm_event_id" INTEGER NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "suburb" VARCHAR(100) NOT NULL,
    "state" VARCHAR(10) NOT NULL DEFAULT 'QLD',
    "roof_area_sqm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimated_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'new',
    "contact_name" VARCHAR(200) NOT NULL DEFAULT '',
    "contact_phone" VARCHAR(30) NOT NULL DEFAULT '',
    "contact_email" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "quote_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uc1_roofing_stormlead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_roofconditionreport" (
    "id" SERIAL NOT NULL,
    "quote_id" INTEGER NOT NULL,
    "report_number" VARCHAR(20) NOT NULL,
    "report_type" VARCHAR(20) NOT NULL DEFAULT 'homebuyer',
    "client_name" VARCHAR(200) NOT NULL DEFAULT '',
    "client_email" TEXT NOT NULL DEFAULT '',
    "client_company" VARCHAR(200) NOT NULL DEFAULT '',
    "condition_grade" VARCHAR(2) NOT NULL DEFAULT 'B',
    "condition_score" INTEGER NOT NULL DEFAULT 70,
    "life_remaining_years" INTEGER NOT NULL DEFAULT 10,
    "urgency_level" VARCHAR(20) NOT NULL DEFAULT 'routine',
    "ai_assessment" TEXT NOT NULL DEFAULT '',
    "recommended_works" TEXT NOT NULL DEFAULT '',
    "inspector_name" VARCHAR(200) NOT NULL DEFAULT '',
    "price_ex_gst" DECIMAL(8,2) NOT NULL DEFAULT 350,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uc1_roofing_roofconditionreport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_roofanalysiscache" (
    "id" SERIAL NOT NULL,
    "cache_key" VARCHAR(128) NOT NULL,
    "address" VARCHAR(255) NOT NULL DEFAULT '',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "zoom" INTEGER NOT NULL,
    "image_hash" VARCHAR(64) NOT NULL,
    "result_json" JSONB NOT NULL,
    "model_version" VARCHAR(64) NOT NULL DEFAULT 'claude-opus-4-7',
    "prompt_version" VARCHAR(32) NOT NULL DEFAULT 'v1',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_hit_at" TIMESTAMP(3) NOT NULL,
    "hit_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "uc1_roofing_roofanalysiscache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_measurementsnapshot" (
    "id" SERIAL NOT NULL,
    "quote_id" INTEGER,
    "snapshot_type" VARCHAR(40) NOT NULL DEFAULT 'use_measurements',
    "source" VARCHAR(80) NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "address_key" VARCHAR(255) NOT NULL DEFAULT '',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "total_area_m2" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "footprint_area_m2" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "pitch_deg" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "pitch_factor" DECIMAL(6,3) NOT NULL DEFAULT 1,
    "eave_lm" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "perimeter_m" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "ridge_lm" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "valley_lm" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "hip_lm" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "rake_lm" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "storeys" SMALLINT NOT NULL DEFAULT 1,
    "material" VARCHAR(80) NOT NULL DEFAULT '',
    "roof_colour" VARCHAR(80) NOT NULL DEFAULT '',
    "section_count" SMALLINT NOT NULL DEFAULT 0,
    "outline_vertices" SMALLINT NOT NULL DEFAULT 0,
    "equipment_json" TEXT NOT NULL DEFAULT '[]',
    "polygon_json" TEXT NOT NULL DEFAULT '[]',
    "sections_json" TEXT NOT NULL DEFAULT '[]',
    "payload_json" TEXT NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uc1_roofing_measurementsnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_measurementupdate" (
    "id" SERIAL NOT NULL,
    "snapshot_id" INTEGER NOT NULL,
    "quote_id" INTEGER,
    "update_type" VARCHAR(40) NOT NULL DEFAULT 'use_measurements',
    "address" TEXT NOT NULL DEFAULT '',
    "address_key" VARCHAR(255) NOT NULL DEFAULT '',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "previous_total_area_m2" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "new_total_area_m2" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "delta_area_m2" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "changed_fields_json" TEXT NOT NULL DEFAULT '[]',
    "payload_json" TEXT NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uc1_roofing_measurementupdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_quotesnapshot" (
    "id" SERIAL NOT NULL,
    "quote_id" INTEGER NOT NULL,
    "measurement_snapshot_id" INTEGER,
    "address" TEXT NOT NULL DEFAULT '',
    "address_key" VARCHAR(255) NOT NULL DEFAULT '',
    "pricing_mechanism" VARCHAR(30) NOT NULL DEFAULT '',
    "pricing_mode" VARCHAR(30) NOT NULL DEFAULT '',
    "package_tier" VARCHAR(30) NOT NULL DEFAULT '',
    "roof_type" VARCHAR(30) NOT NULL DEFAULT '',
    "roof_area_m2" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "eave_lm" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "markup_pct" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "subtotal_ex_gst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_inc_gst" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "inputs_json" TEXT NOT NULL DEFAULT '{}',
    "line_items_json" TEXT NOT NULL DEFAULT '[]',
    "pricing_breakdown_json" TEXT NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uc1_roofing_quotesnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_job" (
    "id" SERIAL NOT NULL,
    "quote_id" INTEGER,
    "address" TEXT NOT NULL DEFAULT '',
    "estimator_id" INTEGER,
    "session_open_at" TIMESTAMP(3),
    "session_close_at" TIMESTAMP(3),
    "estimated_area_m2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimated_valley_lm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimated_ridge_lm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimated_eave_lm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimated_hip_lm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimated_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "actual_area_m2" DOUBLE PRECISION,
    "actual_valley_lm" DOUBLE PRECISION,
    "actual_ridge_lm" DOUBLE PRECISION,
    "actual_eave_lm" DOUBLE PRECISION,
    "actual_hip_lm" DOUBLE PRECISION,
    "actual_total" DECIMAL(12,2),
    "variance_pct_area" DOUBLE PRECISION,
    "variance_pct_quote" DOUBLE PRECISION,
    "learning_rule_candidate" BOOLEAN NOT NULL DEFAULT false,
    "rules_applied_json" TEXT NOT NULL DEFAULT '[]',
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "uc1_roofing_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_correction" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER,
    "quote_id" INTEGER,
    "address" TEXT NOT NULL DEFAULT '',
    "suburb" VARCHAR(120) NOT NULL DEFAULT '',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "dimension" VARCHAR(40) NOT NULL,
    "ai_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "human_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "variance_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "root_cause" TEXT NOT NULL DEFAULT '',
    "estimator_id" INTEGER,
    "hypothesis_id" INTEGER,
    "rule_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uc1_roofing_correction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_hypothesis" (
    "id" SERIAL NOT NULL,
    "description" TEXT NOT NULL,
    "dimension" VARCHAR(40) NOT NULL,
    "root_cause_pattern" TEXT NOT NULL DEFAULT '',
    "trigger_condition" TEXT NOT NULL DEFAULT '',
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "avg_variance_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "promote_to_rule" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "uc1_roofing_hypothesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_learningrule" (
    "id" SERIAL NOT NULL,
    "rule_code" VARCHAR(20) NOT NULL,
    "description" TEXT NOT NULL,
    "category" VARCHAR(30) NOT NULL DEFAULT 'measurement',
    "dimension" VARCHAR(40) NOT NULL,
    "trigger_condition" TEXT NOT NULL DEFAULT '',
    "adjustment" TEXT NOT NULL DEFAULT '{}',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "confidence" INTEGER NOT NULL DEFAULT 72,
    "times_triggered" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "auto_apply" BOOLEAN NOT NULL DEFAULT false,
    "source_id" INTEGER,
    "taught_by_id" INTEGER,
    "date_activated" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uc1_roofing_learningrule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_intelligencesnapshot" (
    "id" SERIAL NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_jobs" INTEGER NOT NULL DEFAULT 0,
    "completed_jobs" INTEGER NOT NULL DEFAULT 0,
    "accuracy_rate_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active_rules" INTEGER NOT NULL DEFAULT 0,
    "auto_apply_rules" INTEGER NOT NULL DEFAULT 0,
    "avg_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence_trajectory" VARCHAR(20) NOT NULL DEFAULT 'stable',
    "top_rules_json" TEXT NOT NULL DEFAULT '[]',
    "gaps_json" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "uc1_roofing_intelligencesnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_teammember" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "role" VARCHAR(30) NOT NULL DEFAULT 'estimator',
    "accuracy_profile" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "date_joined" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uc1_roofing_teammember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_region" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "postcodes" TEXT NOT NULL DEFAULT '',
    "travel_days" INTEGER NOT NULL DEFAULT 0,
    "travel_rate" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "premium_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "uc1_roofing_region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_workstream" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "milestone" VARCHAR(300) NOT NULL DEFAULT '',
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "load_at_session_start" BOOLEAN NOT NULL DEFAULT false,
    "last_updated" TIMESTAMP(3) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "uc1_roofing_workstream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_referencedata" (
    "id" SERIAL NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "uc1_roofing_referencedata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_materialscatalogue" (
    "id" SERIAL NOT NULL,
    "sku" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category" VARCHAR(100) NOT NULL DEFAULT '',
    "unit" VARCHAR(20) NOT NULL DEFAULT 'mÂ²',
    "description" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "uc1_roofing_materialscatalogue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_nomenclatureoverride" (
    "id" SERIAL NOT NULL,
    "customer_term" VARCHAR(100) NOT NULL,
    "standard_term" VARCHAR(100) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "uc1_roofing_nomenclatureoverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_decision" (
    "id" SERIAL NOT NULL,
    "description" TEXT NOT NULL,
    "rationale" TEXT NOT NULL DEFAULT '',
    "alternatives" TEXT NOT NULL DEFAULT '',
    "status" VARCHAR(30) NOT NULL DEFAULT 'confirmed',
    "made_by" VARCHAR(200) NOT NULL DEFAULT '',
    "job_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uc1_roofing_decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uc1_roofing_actionhub" (
    "id" SERIAL NOT NULL,
    "action" VARCHAR(500) NOT NULL,
    "priority" VARCHAR(4) NOT NULL DEFAULT 'P2',
    "due_date" DATE,
    "trigger_condition" TEXT NOT NULL DEFAULT '',
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uc1_roofing_actionhub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_core_organisation" (
    "id" SERIAL NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "vertical" VARCHAR(50) NOT NULL DEFAULT 'construction',
    "default_engagement_type" VARCHAR(30) NOT NULL DEFAULT 'long_project',
    "allowed_engagement_types" TEXT NOT NULL DEFAULT '[]',
    "ai_authority" VARCHAR(30) NOT NULL DEFAULT 'approve_required',
    "settings" TEXT NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_core_organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_core_contact" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "contact_type" VARCHAR(30) NOT NULL DEFAULT 'client',
    "role" VARCHAR(100) NOT NULL DEFAULT '',
    "email" VARCHAR(254) NOT NULL DEFAULT '',
    "phone" VARCHAR(30) NOT NULL DEFAULT '',
    "company" VARCHAR(200) NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_core_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_core_job" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "engagement_type" VARCHAR(30) NOT NULL DEFAULT 'long_project',
    "status" VARCHAR(30) NOT NULL DEFAULT 'intake',
    "client_contact_id" INTEGER,
    "address" VARCHAR(400) NOT NULL DEFAULT '',
    "suburb" VARCHAR(100) NOT NULL DEFAULT '',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "start_date" DATE,
    "target_end_date" DATE,
    "completion_pct" INTEGER NOT NULL DEFAULT 0,
    "health_score" INTEGER NOT NULL DEFAULT 50,
    "budget_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL DEFAULT '',
    "meta" TEXT NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plat_core_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_core_workstream" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "milestone" VARCHAR(300) NOT NULL DEFAULT '',
    "status" VARCHAR(30) NOT NULL DEFAULT 'active',
    "notes" TEXT NOT NULL DEFAULT '',
    "last_updated" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_core_workstream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_core_actionhub" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER,
    "workstream_id" INTEGER,
    "title" VARCHAR(300) NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "priority" VARCHAR(5) NOT NULL DEFAULT 'P2',
    "status" VARCHAR(30) NOT NULL DEFAULT 'open',
    "owner" VARCHAR(200) NOT NULL DEFAULT '',
    "due_date" DATE,
    "source_type" VARCHAR(30) NOT NULL DEFAULT 'manual',
    "source_id" INTEGER,
    "context" TEXT NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plat_core_actionhub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_core_decision" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER,
    "description" TEXT NOT NULL,
    "rationale" TEXT NOT NULL DEFAULT '',
    "alternatives" TEXT NOT NULL DEFAULT '',
    "category" VARCHAR(100) NOT NULL DEFAULT '',
    "status" VARCHAR(30) NOT NULL DEFAULT 'proposed',
    "made_by" VARCHAR(200) NOT NULL DEFAULT '',
    "source_type" VARCHAR(30) NOT NULL DEFAULT 'manual',
    "source_id" INTEGER,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_core_decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_core_learningrule" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "rule_code" VARCHAR(20) NOT NULL,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'guidance',
    "description" TEXT NOT NULL,
    "category" VARCHAR(100) NOT NULL DEFAULT '',
    "dimension" VARCHAR(100) NOT NULL DEFAULT '',
    "trigger_condition" TEXT NOT NULL DEFAULT '{}',
    "adjustment" TEXT NOT NULL DEFAULT '{}',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "times_triggered" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "auto_apply" BOOLEAN NOT NULL DEFAULT false,
    "cannot_override" BOOLEAN NOT NULL DEFAULT false,
    "source_hypothesis_id" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "date_activated" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_core_learningrule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_core_hypothesis" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "dimension" VARCHAR(100) NOT NULL DEFAULT '',
    "root_cause_pattern" VARCHAR(300) NOT NULL DEFAULT '',
    "trigger_condition" TEXT NOT NULL DEFAULT '{}',
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "avg_variance_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "source_type" VARCHAR(30) NOT NULL DEFAULT 'correction',
    "source_id" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_core_hypothesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_core_correction" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER,
    "entity_type" VARCHAR(50) NOT NULL DEFAULT '',
    "entity_id" INTEGER,
    "dimension" VARCHAR(100) NOT NULL,
    "ai_value" DOUBLE PRECISION,
    "human_value" DOUBLE PRECISION,
    "ai_value_text" TEXT NOT NULL DEFAULT '',
    "human_value_text" TEXT NOT NULL DEFAULT '',
    "variance_pct" DOUBLE PRECISION,
    "root_cause" VARCHAR(300) NOT NULL,
    "context" TEXT NOT NULL DEFAULT '{}',
    "corrected_by" VARCHAR(200) NOT NULL DEFAULT '',
    "hypothesis_id" INTEGER,
    "rule_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_core_correction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_core_executionlog" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER,
    "actor_type" VARCHAR(20) NOT NULL DEFAULT 'system',
    "actor_name" VARCHAR(200) NOT NULL DEFAULT '',
    "operation" VARCHAR(30) NOT NULL DEFAULT '',
    "target_table" VARCHAR(100) NOT NULL DEFAULT '',
    "target_id" INTEGER,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "result" TEXT NOT NULL DEFAULT '',
    "status" VARCHAR(20) NOT NULL DEFAULT 'executed',
    "source_message_id" INTEGER,
    "approved_by" VARCHAR(200) NOT NULL DEFAULT '',
    "executed_at" TIMESTAMP(3),
    "error" TEXT NOT NULL DEFAULT '',
    "prompt_version" VARCHAR(50) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_core_executionlog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_core_document" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER,
    "title" VARCHAR(300) NOT NULL,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'file',
    "doc_type" VARCHAR(50) NOT NULL DEFAULT '',
    "classification" VARCHAR(50) NOT NULL DEFAULT '',
    "storage_provider" VARCHAR(20) NOT NULL DEFAULT 'local',
    "storage_ref" VARCHAR(800) NOT NULL DEFAULT '',
    "mime_type" VARCHAR(100) NOT NULL DEFAULT '',
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parent_document_id" INTEGER,
    "text_content" TEXT NOT NULL DEFAULT '',
    "ai_summary" TEXT NOT NULL DEFAULT '',
    "ai_analysis" TEXT NOT NULL DEFAULT '{}',
    "confidence" INTEGER,
    "status" VARCHAR(30) NOT NULL DEFAULT 'uploaded',
    "uploaded_by" VARCHAR(200) NOT NULL DEFAULT '',
    "analyzed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_core_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_core_intelligencesnapshot" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_jobs" INTEGER NOT NULL DEFAULT 0,
    "completed_jobs" INTEGER NOT NULL DEFAULT 0,
    "accuracy_rate_pct" DOUBLE PRECISION,
    "active_rules" INTEGER NOT NULL DEFAULT 0,
    "auto_apply_rules" INTEGER NOT NULL DEFAULT 0,
    "avg_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "top_rules" TEXT NOT NULL DEFAULT '[]',
    "gaps" TEXT NOT NULL DEFAULT '[]',
    "metrics" TEXT NOT NULL DEFAULT '{}',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "plat_core_intelligencesnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_core_chatsession" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER,
    "title" VARCHAR(300) NOT NULL DEFAULT '',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "summary" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "plat_core_chatsession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_core_chatmessage" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "session_id" INTEGER NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "tool_calls" TEXT NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_core_chatmessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_con_phase" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "completion_pct" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "start_date" DATE,
    "end_date" DATE,
    "is_ai_draft" BOOLEAN NOT NULL DEFAULT false,
    "approved_by" VARCHAR(200) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_con_phase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_con_budgetline" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER NOT NULL,
    "phase_id" INTEGER,
    "category" VARCHAR(100) NOT NULL DEFAULT '',
    "description" VARCHAR(300) NOT NULL DEFAULT '',
    "budget_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "committed_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "actual_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plat_con_budgetline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_con_cashflow" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "projected" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "actual" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_con_cashflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_con_risk" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "likelihood" INTEGER NOT NULL DEFAULT 3,
    "impact" INTEGER NOT NULL DEFAULT 3,
    "mitigation" TEXT NOT NULL DEFAULT '',
    "status" VARCHAR(30) NOT NULL DEFAULT 'open',
    "owner" VARCHAR(200) NOT NULL DEFAULT '',
    "escalated_at" TIMESTAMP(3),
    "escalation_note" TEXT NOT NULL DEFAULT '',
    "created_by_ai" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_con_risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_con_variationorder" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER NOT NULL,
    "ref_number" VARCHAR(30) NOT NULL DEFAULT '',
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "scope_change" TEXT NOT NULL DEFAULT '',
    "cost_impact" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "time_impact_days" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "is_ai_drafted" BOOLEAN NOT NULL DEFAULT false,
    "ai_draft" TEXT NOT NULL DEFAULT '{}',
    "submitted_by" VARCHAR(200) NOT NULL DEFAULT '',
    "approved_by" VARCHAR(200) NOT NULL DEFAULT '',
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_con_variationorder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_con_vendor" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category" VARCHAR(100) NOT NULL DEFAULT '',
    "contact_name" VARCHAR(200) NOT NULL DEFAULT '',
    "contact_email" VARCHAR(254) NOT NULL DEFAULT '',
    "contact_phone" VARCHAR(30) NOT NULL DEFAULT '',
    "rating" INTEGER NOT NULL DEFAULT 5,
    "notes" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_con_vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_con_procurement" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER NOT NULL,
    "item" VARCHAR(300) NOT NULL,
    "category" VARCHAR(100) NOT NULL DEFAULT '',
    "vendor_id" INTEGER,
    "vendor_name" VARCHAR(200) NOT NULL DEFAULT '',
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "due_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_con_procurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_con_roommatrix" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER NOT NULL,
    "zone" VARCHAR(100) NOT NULL DEFAULT '',
    "name" VARCHAR(200) NOT NULL,
    "area_sqm" DOUBLE PRECISION,
    "ceiling_height" VARCHAR(50) NOT NULL DEFAULT '',
    "finishes" TEXT NOT NULL DEFAULT '{}',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_con_roommatrix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_con_meetingminutes" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER NOT NULL,
    "meeting_date" DATE NOT NULL,
    "title" VARCHAR(300) NOT NULL DEFAULT '',
    "attendees" VARCHAR(500) NOT NULL DEFAULT '',
    "raw_minutes" TEXT NOT NULL,
    "extracted_actions" TEXT NOT NULL DEFAULT '[]',
    "actions_count" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(30) NOT NULL DEFAULT 'raw',
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_con_meetingminutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_con_weeklyreport" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER NOT NULL,
    "week_ending" DATE NOT NULL,
    "title" VARCHAR(300) NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "is_ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by" VARCHAR(200) NOT NULL DEFAULT '',
    "approved_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "document_id" INTEGER,

    CONSTRAINT "plat_con_weeklyreport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_con_bimmodel" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "provider" VARCHAR(30) NOT NULL DEFAULT 'bimx',
    "embed_url" VARCHAR(800) NOT NULL,
    "client_visible" BOOLEAN NOT NULL DEFAULT false,
    "added_by" VARCHAR(200) NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_con_bimmodel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_con_portaltoken" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "job_id" INTEGER NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "label" VARCHAR(200) NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "views_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_con_portaltoken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_con_accountingconnection" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "provider" VARCHAR(20) NOT NULL DEFAULT 'demo',
    "status" VARCHAR(30) NOT NULL DEFAULT 'disconnected',
    "org_name" VARCHAR(200) NOT NULL DEFAULT '',
    "access_token" VARCHAR(500) NOT NULL DEFAULT '',
    "last_sync" TIMESTAMP(3),
    "sync_log" TEXT NOT NULL DEFAULT '',
    "records_synced" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_con_accountingconnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_cfg_teammember" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "role" VARCHAR(30) NOT NULL DEFAULT 'editor',
    "email" VARCHAR(254) NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_cfg_teammember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_cfg_region" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "postcodes" VARCHAR(500) NOT NULL DEFAULT '',
    "travel_days" INTEGER NOT NULL DEFAULT 0,
    "premium_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_cfg_region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_cfg_reference" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "ref_type" VARCHAR(50) NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "value" TEXT NOT NULL DEFAULT '{}',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_cfg_reference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_cfg_nomenclature" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "customer_term" VARCHAR(200) NOT NULL,
    "standard_term" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_cfg_nomenclature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plat_cfg_setting" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "setting_key" VARCHAR(100) NOT NULL,
    "value" TEXT NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plat_cfg_setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "uc1_roofing_contact_created_at_idx" ON "uc1_roofing_contact"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uc1_roofing_ratecard_material_pitch_type_key" ON "uc1_roofing_ratecard"("material", "pitch_type");

-- CreateIndex
CREATE UNIQUE INDEX "uc1_roofing_quote_ref_number_key" ON "uc1_roofing_quote"("ref_number");

-- CreateIndex
CREATE INDEX "uc1_roofing_quote_created_at_idx" ON "uc1_roofing_quote"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uc1_roofing_roofpolygon_quote_id_key" ON "uc1_roofing_roofpolygon"("quote_id");

-- CreateIndex
CREATE INDEX "uc1_roofing_buildingfootprint_min_lat_max_lat_idx" ON "uc1_roofing_buildingfootprint"("min_lat", "max_lat");

-- CreateIndex
CREATE INDEX "uc1_roofing_buildingfootprint_min_lon_max_lon_idx" ON "uc1_roofing_buildingfootprint"("min_lon", "max_lon");

-- CreateIndex
CREATE UNIQUE INDEX "uc1_roofing_vendormaterialprice_vendor_id_material_key" ON "uc1_roofing_vendormaterialprice"("vendor_id", "material");

-- CreateIndex
CREATE UNIQUE INDEX "uc1_roofing_purchaseorder_po_number_key" ON "uc1_roofing_purchaseorder"("po_number");

-- CreateIndex
CREATE UNIQUE INDEX "uc1_roofing_rooflidaranalysis_quote_id_key" ON "uc1_roofing_rooflidaranalysis"("quote_id");

-- CreateIndex
CREATE INDEX "uc1_roofing_executionlog_created_at_idx" ON "uc1_roofing_executionlog"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uc1_roofing_financeprovider_slug_key" ON "uc1_roofing_financeprovider"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "uc1_roofing_roofconditionreport_report_number_key" ON "uc1_roofing_roofconditionreport"("report_number");

-- CreateIndex
CREATE UNIQUE INDEX "uc1_roofing_roofanalysiscache_cache_key_key" ON "uc1_roofing_roofanalysiscache"("cache_key");

-- CreateIndex
CREATE INDEX "uc1_roofing_roofanalysiscache_address_created_at_idx" ON "uc1_roofing_roofanalysiscache"("address", "created_at");

-- CreateIndex
CREATE INDEX "uc1_roofing_measurementsnapshot_address_key_created_at_idx" ON "uc1_roofing_measurementsnapshot"("address_key", "created_at");

-- CreateIndex
CREATE INDEX "uc1_roofing_measurementsnapshot_snapshot_type_created_at_idx" ON "uc1_roofing_measurementsnapshot"("snapshot_type", "created_at");

-- CreateIndex
CREATE INDEX "uc1_roofing_measurementupdate_address_key_created_at_idx" ON "uc1_roofing_measurementupdate"("address_key", "created_at");

-- CreateIndex
CREATE INDEX "uc1_roofing_measurementupdate_update_type_created_at_idx" ON "uc1_roofing_measurementupdate"("update_type", "created_at");

-- CreateIndex
CREATE INDEX "uc1_roofing_quotesnapshot_address_key_created_at_idx" ON "uc1_roofing_quotesnapshot"("address_key", "created_at");

-- CreateIndex
CREATE INDEX "uc1_roofing_quotesnapshot_quote_id_created_at_idx" ON "uc1_roofing_quotesnapshot"("quote_id", "created_at");

-- CreateIndex
CREATE INDEX "uc1_roofing_job_created_at_idx" ON "uc1_roofing_job"("created_at");

-- CreateIndex
CREATE INDEX "uc1_roofing_correction_dimension_created_at_idx" ON "uc1_roofing_correction"("dimension", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uc1_roofing_learningrule_rule_code_key" ON "uc1_roofing_learningrule"("rule_code");

-- CreateIndex
CREATE UNIQUE INDEX "uc1_roofing_region_name_key" ON "uc1_roofing_region"("name");

-- CreateIndex
CREATE UNIQUE INDEX "uc1_roofing_referencedata_type_code_key" ON "uc1_roofing_referencedata"("type", "code");

-- CreateIndex
CREATE UNIQUE INDEX "uc1_roofing_materialscatalogue_sku_key" ON "uc1_roofing_materialscatalogue"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "uc1_roofing_nomenclatureoverride_customer_term_key" ON "uc1_roofing_nomenclatureoverride"("customer_term");

-- CreateIndex
CREATE INDEX "uc1_roofing_decision_created_at_idx" ON "uc1_roofing_decision"("created_at");

-- CreateIndex
CREATE INDEX "uc1_roofing_actionhub_status_due_date_idx" ON "uc1_roofing_actionhub"("status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "plat_core_organisation_slug_key" ON "plat_core_organisation"("slug");

-- CreateIndex
CREATE INDEX "plat_core_contact_org_id_is_active_idx" ON "plat_core_contact"("org_id", "is_active");

-- CreateIndex
CREATE INDEX "plat_core_job_org_id_status_idx" ON "plat_core_job"("org_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "plat_core_job_org_id_code_key" ON "plat_core_job"("org_id", "code");

-- CreateIndex
CREATE INDEX "plat_core_workstream_org_id_status_idx" ON "plat_core_workstream"("org_id", "status");

-- CreateIndex
CREATE INDEX "plat_core_actionhub_org_id_status_due_date_idx" ON "plat_core_actionhub"("org_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "plat_core_decision_org_id_status_idx" ON "plat_core_decision"("org_id", "status");

-- CreateIndex
CREATE INDEX "plat_core_learningrule_org_id_is_active_idx" ON "plat_core_learningrule"("org_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "plat_core_learningrule_org_id_rule_code_key" ON "plat_core_learningrule"("org_id", "rule_code");

-- CreateIndex
CREATE INDEX "plat_core_hypothesis_org_id_status_idx" ON "plat_core_hypothesis"("org_id", "status");

-- CreateIndex
CREATE INDEX "plat_core_correction_org_id_dimension_created_at_idx" ON "plat_core_correction"("org_id", "dimension", "created_at");

-- CreateIndex
CREATE INDEX "plat_core_executionlog_org_id_status_created_at_idx" ON "plat_core_executionlog"("org_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "plat_core_document_org_id_status_idx" ON "plat_core_document"("org_id", "status");

-- CreateIndex
CREATE INDEX "plat_core_intelligencesnapshot_org_id_captured_at_idx" ON "plat_core_intelligencesnapshot"("org_id", "captured_at");

-- CreateIndex
CREATE INDEX "plat_core_chatsession_org_id_started_at_idx" ON "plat_core_chatsession"("org_id", "started_at");

-- CreateIndex
CREATE INDEX "plat_core_chatmessage_session_id_created_at_idx" ON "plat_core_chatmessage"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "plat_con_phase_job_id_sort_order_idx" ON "plat_con_phase"("job_id", "sort_order");

-- CreateIndex
CREATE INDEX "plat_con_budgetline_job_id_category_idx" ON "plat_con_budgetline"("job_id", "category");

-- CreateIndex
CREATE INDEX "plat_con_cashflow_job_id_period_idx" ON "plat_con_cashflow"("job_id", "period");

-- CreateIndex
CREATE INDEX "plat_con_risk_job_id_status_idx" ON "plat_con_risk"("job_id", "status");

-- CreateIndex
CREATE INDEX "plat_con_variationorder_job_id_status_idx" ON "plat_con_variationorder"("job_id", "status");

-- CreateIndex
CREATE INDEX "plat_con_vendor_org_id_is_active_idx" ON "plat_con_vendor"("org_id", "is_active");

-- CreateIndex
CREATE INDEX "plat_con_procurement_job_id_status_idx" ON "plat_con_procurement"("job_id", "status");

-- CreateIndex
CREATE INDEX "plat_con_roommatrix_job_id_zone_idx" ON "plat_con_roommatrix"("job_id", "zone");

-- CreateIndex
CREATE INDEX "plat_con_meetingminutes_job_id_status_idx" ON "plat_con_meetingminutes"("job_id", "status");

-- CreateIndex
CREATE INDEX "plat_con_weeklyreport_job_id_week_ending_idx" ON "plat_con_weeklyreport"("job_id", "week_ending");

-- CreateIndex
CREATE INDEX "plat_con_bimmodel_job_id_idx" ON "plat_con_bimmodel"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "plat_con_portaltoken_token_key" ON "plat_con_portaltoken"("token");

-- CreateIndex
CREATE INDEX "plat_con_portaltoken_job_id_is_active_idx" ON "plat_con_portaltoken"("job_id", "is_active");

-- CreateIndex
CREATE INDEX "plat_con_accountingconnection_org_id_idx" ON "plat_con_accountingconnection"("org_id");

-- CreateIndex
CREATE INDEX "plat_cfg_teammember_org_id_is_active_idx" ON "plat_cfg_teammember"("org_id", "is_active");

-- CreateIndex
CREATE INDEX "plat_cfg_region_org_id_is_active_idx" ON "plat_cfg_region"("org_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "plat_cfg_reference_org_id_ref_type_code_key" ON "plat_cfg_reference"("org_id", "ref_type", "code");

-- CreateIndex
CREATE UNIQUE INDEX "plat_cfg_nomenclature_org_id_customer_term_key" ON "plat_cfg_nomenclature"("org_id", "customer_term");

-- CreateIndex
CREATE UNIQUE INDEX "plat_cfg_setting_org_id_setting_key_key" ON "plat_cfg_setting"("org_id", "setting_key");

-- AddForeignKey
ALTER TABLE "uc1_roofing_quote" ADD CONSTRAINT "uc1_roofing_quote_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "uc1_roofing_contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_quoteitem" ADD CONSTRAINT "uc1_roofing_quoteitem_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "uc1_roofing_quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_roofpolygon" ADD CONSTRAINT "uc1_roofing_roofpolygon_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "uc1_roofing_quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_vendormaterialprice" ADD CONSTRAINT "uc1_roofing_vendormaterialprice_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "uc1_roofing_vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_purchaseorder" ADD CONSTRAINT "uc1_roofing_purchaseorder_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "uc1_roofing_quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_purchaseorder" ADD CONSTRAINT "uc1_roofing_purchaseorder_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "uc1_roofing_vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_purchaseorderitem" ADD CONSTRAINT "uc1_roofing_purchaseorderitem_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "uc1_roofing_purchaseorder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_rooflidaranalysis" ADD CONSTRAINT "uc1_roofing_rooflidaranalysis_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "uc1_roofing_quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_executionlog" ADD CONSTRAINT "uc1_roofing_executionlog_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "uc1_roofing_quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_solarreferral" ADD CONSTRAINT "uc1_roofing_solarreferral_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "uc1_roofing_quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_solarreferral" ADD CONSTRAINT "uc1_roofing_solarreferral_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "uc1_roofing_solarpartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_stormlead" ADD CONSTRAINT "uc1_roofing_stormlead_storm_event_id_fkey" FOREIGN KEY ("storm_event_id") REFERENCES "uc1_roofing_stormevent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_stormlead" ADD CONSTRAINT "uc1_roofing_stormlead_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "uc1_roofing_quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_roofconditionreport" ADD CONSTRAINT "uc1_roofing_roofconditionreport_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "uc1_roofing_quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_measurementsnapshot" ADD CONSTRAINT "uc1_roofing_measurementsnapshot_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "uc1_roofing_quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_measurementupdate" ADD CONSTRAINT "uc1_roofing_measurementupdate_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "uc1_roofing_measurementsnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_measurementupdate" ADD CONSTRAINT "uc1_roofing_measurementupdate_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "uc1_roofing_quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_quotesnapshot" ADD CONSTRAINT "uc1_roofing_quotesnapshot_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "uc1_roofing_quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_quotesnapshot" ADD CONSTRAINT "uc1_roofing_quotesnapshot_measurement_snapshot_id_fkey" FOREIGN KEY ("measurement_snapshot_id") REFERENCES "uc1_roofing_measurementsnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_job" ADD CONSTRAINT "uc1_roofing_job_estimator_id_fkey" FOREIGN KEY ("estimator_id") REFERENCES "uc1_roofing_teammember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_correction" ADD CONSTRAINT "uc1_roofing_correction_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "uc1_roofing_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_correction" ADD CONSTRAINT "uc1_roofing_correction_estimator_id_fkey" FOREIGN KEY ("estimator_id") REFERENCES "uc1_roofing_teammember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_correction" ADD CONSTRAINT "uc1_roofing_correction_hypothesis_id_fkey" FOREIGN KEY ("hypothesis_id") REFERENCES "uc1_roofing_hypothesis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_learningrule" ADD CONSTRAINT "uc1_roofing_learningrule_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "uc1_roofing_hypothesis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uc1_roofing_learningrule" ADD CONSTRAINT "uc1_roofing_learningrule_taught_by_id_fkey" FOREIGN KEY ("taught_by_id") REFERENCES "uc1_roofing_teammember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_contact" ADD CONSTRAINT "plat_core_contact_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_job" ADD CONSTRAINT "plat_core_job_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_job" ADD CONSTRAINT "plat_core_job_client_contact_id_fkey" FOREIGN KEY ("client_contact_id") REFERENCES "plat_core_contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_workstream" ADD CONSTRAINT "plat_core_workstream_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_workstream" ADD CONSTRAINT "plat_core_workstream_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "plat_core_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_actionhub" ADD CONSTRAINT "plat_core_actionhub_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_actionhub" ADD CONSTRAINT "plat_core_actionhub_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "plat_core_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_actionhub" ADD CONSTRAINT "plat_core_actionhub_workstream_id_fkey" FOREIGN KEY ("workstream_id") REFERENCES "plat_core_workstream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_decision" ADD CONSTRAINT "plat_core_decision_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_decision" ADD CONSTRAINT "plat_core_decision_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "plat_core_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_learningrule" ADD CONSTRAINT "plat_core_learningrule_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_learningrule" ADD CONSTRAINT "plat_core_learningrule_source_hypothesis_id_fkey" FOREIGN KEY ("source_hypothesis_id") REFERENCES "plat_core_hypothesis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_hypothesis" ADD CONSTRAINT "plat_core_hypothesis_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_correction" ADD CONSTRAINT "plat_core_correction_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_correction" ADD CONSTRAINT "plat_core_correction_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "plat_core_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_correction" ADD CONSTRAINT "plat_core_correction_hypothesis_id_fkey" FOREIGN KEY ("hypothesis_id") REFERENCES "plat_core_hypothesis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_correction" ADD CONSTRAINT "plat_core_correction_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "plat_core_learningrule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_executionlog" ADD CONSTRAINT "plat_core_executionlog_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_executionlog" ADD CONSTRAINT "plat_core_executionlog_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "plat_core_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_document" ADD CONSTRAINT "plat_core_document_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_document" ADD CONSTRAINT "plat_core_document_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "plat_core_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_document" ADD CONSTRAINT "plat_core_document_parent_document_id_fkey" FOREIGN KEY ("parent_document_id") REFERENCES "plat_core_document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_intelligencesnapshot" ADD CONSTRAINT "plat_core_intelligencesnapshot_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_chatsession" ADD CONSTRAINT "plat_core_chatsession_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_chatsession" ADD CONSTRAINT "plat_core_chatsession_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "plat_core_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_chatmessage" ADD CONSTRAINT "plat_core_chatmessage_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_core_chatmessage" ADD CONSTRAINT "plat_core_chatmessage_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "plat_core_chatsession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_phase" ADD CONSTRAINT "plat_con_phase_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_phase" ADD CONSTRAINT "plat_con_phase_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "plat_core_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_budgetline" ADD CONSTRAINT "plat_con_budgetline_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_budgetline" ADD CONSTRAINT "plat_con_budgetline_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "plat_core_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_budgetline" ADD CONSTRAINT "plat_con_budgetline_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "plat_con_phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_cashflow" ADD CONSTRAINT "plat_con_cashflow_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_cashflow" ADD CONSTRAINT "plat_con_cashflow_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "plat_core_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_risk" ADD CONSTRAINT "plat_con_risk_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_risk" ADD CONSTRAINT "plat_con_risk_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "plat_core_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_variationorder" ADD CONSTRAINT "plat_con_variationorder_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_variationorder" ADD CONSTRAINT "plat_con_variationorder_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "plat_core_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_vendor" ADD CONSTRAINT "plat_con_vendor_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_procurement" ADD CONSTRAINT "plat_con_procurement_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_procurement" ADD CONSTRAINT "plat_con_procurement_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "plat_core_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_procurement" ADD CONSTRAINT "plat_con_procurement_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "plat_con_vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_roommatrix" ADD CONSTRAINT "plat_con_roommatrix_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_roommatrix" ADD CONSTRAINT "plat_con_roommatrix_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "plat_core_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_meetingminutes" ADD CONSTRAINT "plat_con_meetingminutes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_meetingminutes" ADD CONSTRAINT "plat_con_meetingminutes_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "plat_core_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_weeklyreport" ADD CONSTRAINT "plat_con_weeklyreport_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_weeklyreport" ADD CONSTRAINT "plat_con_weeklyreport_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "plat_core_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_bimmodel" ADD CONSTRAINT "plat_con_bimmodel_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_bimmodel" ADD CONSTRAINT "plat_con_bimmodel_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "plat_core_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_portaltoken" ADD CONSTRAINT "plat_con_portaltoken_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_portaltoken" ADD CONSTRAINT "plat_con_portaltoken_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "plat_core_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_con_accountingconnection" ADD CONSTRAINT "plat_con_accountingconnection_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_cfg_teammember" ADD CONSTRAINT "plat_cfg_teammember_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_cfg_region" ADD CONSTRAINT "plat_cfg_region_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_cfg_reference" ADD CONSTRAINT "plat_cfg_reference_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_cfg_nomenclature" ADD CONSTRAINT "plat_cfg_nomenclature_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plat_cfg_setting" ADD CONSTRAINT "plat_cfg_setting_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "plat_core_organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

