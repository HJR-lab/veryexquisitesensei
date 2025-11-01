-- Create Suppliers table
CREATE TABLE IF NOT EXISTS "suppliers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contact_person" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- Create Inventory Categories table
CREATE TABLE IF NOT EXISTS "inventory_categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_categories_pkey" PRIMARY KEY ("id")
);

-- Create Inventory Items table
CREATE TABLE IF NOT EXISTS "inventory_items" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "supplier_id" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sku" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "current_stock" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "min_stock_level" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "reorder_quantity" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(10,2),
    "location" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "low_stock_alert_sent" BOOLEAN NOT NULL DEFAULT false,
    "last_alert_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- Create Inventory Transactions table (for tracking stock changes)
CREATE TABLE IF NOT EXISTS "inventory_transactions" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "transaction_type" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "previous_stock" DECIMAL(10,2) NOT NULL,
    "new_stock" DECIMAL(10,2) NOT NULL,
    "unit_cost" DECIMAL(10,2),
    "reference_number" TEXT,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- Create Inventory Orders table (for tracking orders to suppliers)
CREATE TABLE IF NOT EXISTS "inventory_orders" (
    "id" SERIAL NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "order_number" TEXT,
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_delivery_date" TIMESTAMP(3),
    "actual_delivery_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "total_cost" DECIMAL(10,2),
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_orders_pkey" PRIMARY KEY ("id")
);

-- Create Inventory Order Items table (line items for orders)
CREATE TABLE IF NOT EXISTS "inventory_order_items" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity_ordered" DECIMAL(10,2) NOT NULL,
    "quantity_received" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(10,2),
    "notes" TEXT,

    CONSTRAINT "inventory_order_items_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "inventory_items_category_id_idx" ON "inventory_items"("category_id");
CREATE INDEX IF NOT EXISTS "inventory_items_supplier_id_idx" ON "inventory_items"("supplier_id");
CREATE INDEX IF NOT EXISTS "inventory_items_active_idx" ON "inventory_items"("active");
CREATE INDEX IF NOT EXISTS "inventory_items_current_stock_idx" ON "inventory_items"("current_stock");
CREATE INDEX IF NOT EXISTS "inventory_transactions_item_id_idx" ON "inventory_transactions"("item_id");
CREATE INDEX IF NOT EXISTS "inventory_transactions_created_at_idx" ON "inventory_transactions"("created_at");
CREATE INDEX IF NOT EXISTS "inventory_orders_supplier_id_idx" ON "inventory_orders"("supplier_id");
CREATE INDEX IF NOT EXISTS "inventory_orders_status_idx" ON "inventory_orders"("status");
CREATE INDEX IF NOT EXISTS "inventory_order_items_order_id_idx" ON "inventory_order_items"("order_id");
CREATE INDEX IF NOT EXISTS "inventory_order_items_item_id_idx" ON "inventory_order_items"("item_id");
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_email_key" ON "suppliers"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_categories_name_key" ON "inventory_categories"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_items_sku_key" ON "inventory_items"("sku") WHERE "sku" IS NOT NULL;

-- Add foreign keys
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "inventory_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_orders" ADD CONSTRAINT "inventory_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_order_items" ADD CONSTRAINT "inventory_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "inventory_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_order_items" ADD CONSTRAINT "inventory_order_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Insert default categories
INSERT INTO "inventory_categories" ("name", "description") VALUES
('Clay', 'Various types of clay for pottery'),
('Glazes', 'Glazes and finishing materials'),
('Tools', 'Pottery tools and equipment'),
('Materials', 'General materials and supplies'),
('Kiln Supplies', 'Kiln-related materials')
ON CONFLICT ("name") DO NOTHING;
