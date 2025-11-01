-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "shopify_customer_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "customer_type" TEXT NOT NULL,
    "course_purchase_date" TIMESTAMP(3),
    "course_expiry_date" TIMESTAMP(3),
    "classes_allocated" INTEGER NOT NULL DEFAULT 6,
    "classes_used" INTEGER NOT NULL DEFAULT 0,
    "classes_forfeited" INTEGER NOT NULL DEFAULT 0,
    "membership_tier" TEXT,
    "membership_start_date" TIMESTAMP(3),
    "membership_end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_synced_at" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pottery_pieces" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "date_completed" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "clay_type" TEXT NOT NULL,
    "glazes" JSONB NOT NULL DEFAULT '[]',
    "original_weight" DECIMAL(10,2),
    "final_weight" DECIMAL(10,2),
    "height" DECIMAL(10,2),
    "length" DECIMAL(10,2),
    "width" DECIMAL(10,2),
    "images" JSONB NOT NULL DEFAULT '[]',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "featured_order" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pottery_pieces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_templates" (
    "id" SERIAL NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "class_type" TEXT NOT NULL,
    "instructor" TEXT NOT NULL,
    "room" TEXT,
    "max_capacity" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_instances" (
    "id" SERIAL NOT NULL,
    "template_id" INTEGER,
    "class_date" TIMESTAMP(3) NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "class_type" TEXT NOT NULL,
    "instructor" TEXT NOT NULL,
    "room" TEXT,
    "max_capacity" INTEGER NOT NULL,
    "current_enrollment" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "class_instance_id" INTEGER NOT NULL,
    "booking_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'booked',
    "advance_notice_given" BOOLEAN NOT NULL DEFAULT false,
    "attended" BOOLEAN,
    "marked_by_admin_id" INTEGER,
    "attendance_marked_at" TIMESTAMP(3),
    "attendance_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waitlist" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "class_instance_id" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "spot_offered_at" TIMESTAMP(3),
    "notification_sent_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "email_sent" BOOLEAN NOT NULL DEFAULT false,
    "email_sent_at" TIMESTAMP(3),
    "email_opened" BOOLEAN NOT NULL DEFAULT false,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "related_class_instance_id" INTEGER,
    "related_booking_id" INTEGER,
    "related_piece_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clay_types" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clay_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "glazes" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "color_hex" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "glazes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_settings" (
    "id" SERIAL NOT NULL,
    "setting_key" TEXT NOT NULL,
    "setting_value" TEXT NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_shopify_customer_id_key" ON "customers"("shopify_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_shopify_customer_id_idx" ON "customers"("shopify_customer_id");

-- CreateIndex
CREATE INDEX "customers_customer_type_idx" ON "customers"("customer_type");

-- CreateIndex
CREATE INDEX "pottery_pieces_customer_id_idx" ON "pottery_pieces"("customer_id");

-- CreateIndex
CREATE INDEX "pottery_pieces_date_completed_idx" ON "pottery_pieces"("date_completed");

-- CreateIndex
CREATE INDEX "pottery_pieces_clay_type_idx" ON "pottery_pieces"("clay_type");

-- CreateIndex
CREATE INDEX "pottery_pieces_is_public_idx" ON "pottery_pieces"("is_public");

-- CreateIndex
CREATE INDEX "pottery_pieces_featured_featured_order_idx" ON "pottery_pieces"("featured", "featured_order");

-- CreateIndex
CREATE INDEX "class_templates_dayOfWeek_idx" ON "class_templates"("dayOfWeek");

-- CreateIndex
CREATE INDEX "class_templates_active_idx" ON "class_templates"("active");

-- CreateIndex
CREATE INDEX "class_instances_class_date_idx" ON "class_instances"("class_date");

-- CreateIndex
CREATE INDEX "class_instances_template_id_idx" ON "class_instances"("template_id");

-- CreateIndex
CREATE INDEX "class_instances_status_idx" ON "class_instances"("status");

-- CreateIndex
CREATE UNIQUE INDEX "class_instances_class_date_start_time_room_key" ON "class_instances"("class_date", "start_time", "room");

-- CreateIndex
CREATE INDEX "bookings_student_id_idx" ON "bookings"("student_id");

-- CreateIndex
CREATE INDEX "bookings_class_instance_id_idx" ON "bookings"("class_instance_id");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE INDEX "bookings_booking_date_idx" ON "bookings"("booking_date");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_student_id_class_instance_id_key" ON "bookings"("student_id", "class_instance_id");

-- CreateIndex
CREATE INDEX "waitlist_student_id_idx" ON "waitlist"("student_id");

-- CreateIndex
CREATE INDEX "waitlist_class_instance_id_idx" ON "waitlist"("class_instance_id");

-- CreateIndex
CREATE INDEX "waitlist_position_idx" ON "waitlist"("position");

-- CreateIndex
CREATE INDEX "waitlist_expires_at_idx" ON "waitlist"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_student_id_class_instance_id_key" ON "waitlist"("student_id", "class_instance_id");

-- CreateIndex
CREATE INDEX "notifications_customer_id_idx" ON "notifications"("customer_id");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE INDEX "notifications_read_idx" ON "notifications"("read");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "clay_types_name_key" ON "clay_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "glazes_name_key" ON "glazes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "admin_settings_setting_key_key" ON "admin_settings"("setting_key");

-- AddForeignKey
ALTER TABLE "pottery_pieces" ADD CONSTRAINT "pottery_pieces_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_instances" ADD CONSTRAINT "class_instances_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "class_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_class_instance_id_fkey" FOREIGN KEY ("class_instance_id") REFERENCES "class_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_class_instance_id_fkey" FOREIGN KEY ("class_instance_id") REFERENCES "class_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

