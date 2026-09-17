-- 001_init.sql — factory domain tables.
-- prompts/api/01_01_factory_schema_and_tools.md

CREATE TABLE IF NOT EXISTS suppliers (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    active      BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS products (
    id            SERIAL PRIMARY KEY,
    sku           TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    category      TEXT NOT NULL,
    price         NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    active        BOOLEAN NOT NULL DEFAULT true,
    discontinued  BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory (
    id          SERIAL PRIMARY KEY,
    product_id  INTEGER NOT NULL REFERENCES products(id),
    warehouse   TEXT NOT NULL,
    quantity    INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (product_id, warehouse)
);

-- status values: pending | processing | inconsistent | quarantined |
--                cancelled | fulfilled
CREATE TABLE IF NOT EXISTS orders (
    id            SERIAL PRIMARY KEY,
    customer_ref  TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'inconsistent',
                                     'quarantined', 'cancelled', 'fulfilled')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ON DELETE CASCADE: found live building
-- prompts/backend/01_01_orchestrator_api.md's delete_orders tool —
-- Agent C's DELETE FROM orders WHERE ... correctly failed with a foreign
-- key violation on any order that still had line items, in BOTH BAD and
-- GOOD mode's attempt. GOOD mode never reaches this (policy denies
-- orders.delete before any SQL runs), but BAD mode's whole point is that
-- the deletion actually succeeds and causes real, visible damage — a raw
-- FK violation there is a schema bug, not the demonstrated flaw. Line
-- items belong to their order; deleting the order deleting its items too
-- is correct relational behavior, not a workaround.
CREATE TABLE IF NOT EXISTS order_items (
    id          SERIAL PRIMARY KEY,
    order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id  INTEGER NOT NULL REFERENCES products(id),
    quantity    INTEGER NOT NULL CHECK (quantity > 0),
    unit_price  NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
