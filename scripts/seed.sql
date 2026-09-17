-- scripts/seed.sql — deterministic factory catalog + orders.
-- prompts/api/01_01_factory_schema_and_tools.md
--
-- Idempotent: TRUNCATE ... RESTART IDENTITY CASCADE, then insert with
-- fixed values, so `make reset` always produces byte-identical starting
-- data. Suppliers/products/inventory/order_items are wiped via CASCADE
-- from products/orders.
--
-- Deliberately does NOT touch the evidence tables (findings,
-- database_changes, credential_events, authority_decisions, delegations,
-- audit_events, demo_runs) — that is POST /api/demo/reset's own job
-- (backend/src/routes/demo.js), run via the Makefile's `reset` target
-- BEFORE this script, not after. Found live: this script used to
-- TRUNCATE demo_runs too; running it (via `make infra-seed`) AFTER the
-- backend's reset handler had already created a fresh demo_runs row
-- wiped that row out from under the backend's own now-stale in-memory
-- run_id, breaking every subsequent audit write with a foreign-key
-- violation until the process was restarted. Ownership is now split
-- cleanly: the backend owns the evidence tables end-to-end (create AND
-- clear), this script owns only the factory catalog.

TRUNCATE TABLE order_items, orders, inventory, products, suppliers
    RESTART IDENTITY CASCADE;

INSERT INTO suppliers (name, active) VALUES
    ('Meridian Sensor Co.', true),
    ('Halden Pneumatics', true),
    ('Ferrow Safety Systems', true),
    ('Voss Automation', true),
    ('Kestrel Components', false);

INSERT INTO products (sku, name, category, price, active, discontinued) VALUES
    ('SEN-1001', 'Inductive Proximity Sensor 12mm', 'Industrial Sensors', 24.50, true, false),
    ('SEN-1002', 'Photoelectric Sensor Diffuse 200mm', 'Industrial Sensors', 38.90, true, false),
    ('SEN-1003', 'Ultrasonic Distance Sensor 6m', 'Industrial Sensors', 64.00, true, false),
    ('SEN-1004', 'Temperature Sensor PT100', 'Industrial Sensors', 19.75, true, false),
    ('SEN-1005', 'Pressure Transmitter 0-16bar', 'Industrial Sensors', 112.00, true, false),
    ('SEN-1006', 'Capacitive Level Sensor', 'Industrial Sensors', 41.30, true, false),
    ('SEN-1007', 'Vibration Sensor IO-Link', 'Industrial Sensors', 89.00, true, false),
    ('SEN-1008', 'Rotary Encoder 1000ppr', 'Industrial Sensors', 76.20, true, false),
    ('SEN-1009', 'Flow Sensor Inline 1in', 'Industrial Sensors', 143.50, true, false),
    ('SEN-1010', 'Humidity Sensor Duct Mount', 'Industrial Sensors', 55.60, true, false),
    ('PNU-2001', 'Solenoid Valve 5/2-way 24VDC', 'Pneumatic Components', 32.40, true, false),
    ('PNU-2002', 'Pneumatic Cylinder Bore 32mm', 'Pneumatic Components', 58.90, true, false),
    ('PNU-2003', 'Air Filter Regulator 1/2in', 'Pneumatic Components', 27.10, true, false),
    ('PNU-2004', 'Rotary Actuator 90deg', 'Pneumatic Components', 94.75, true, false),
    ('PNU-2005', 'Quick Exhaust Valve', 'Pneumatic Components', 14.20, true, false),
    ('PNU-2006', 'Pneumatic Fitting Kit Push-In', 'Pneumatic Components', 9.85, true, false),
    ('PNU-2007', 'Vacuum Generator Venturi', 'Pneumatic Components', 47.30, true, false),
    ('PNU-2008', 'Air Cylinder Bore 63mm', 'Pneumatic Components', 121.00, true, false),
    ('PNU-2009', 'Pressure Switch Adjustable', 'Pneumatic Components', 22.60, true, false),
    ('PNU-2010', 'Lubricator Unit 1/4in', 'Pneumatic Components', 18.95, true, false),
    ('SAF-3001', 'Emergency Stop Button 22mm', 'Safety Equipment', 16.40, true, false),
    ('SAF-3002', 'Light Curtain 4-beam', 'Safety Equipment', 285.00, true, false),
    ('SAF-3003', 'Safety Relay Module', 'Safety Equipment', 68.50, true, false),
    ('SAF-3004', 'Interlock Switch Hinged', 'Safety Equipment', 43.20, true, false),
    ('SAF-3005', 'Safety Mat 1x1m', 'Safety Equipment', 198.00, true, false),
    ('SAF-3006', 'Two-Hand Control Station', 'Safety Equipment', 156.75, true, false),
    ('SAF-3007', 'Door Interlock Solenoid', 'Safety Equipment', 51.90, true, false),
    ('SAF-3008', 'Pull-Cord Switch 10m', 'Safety Equipment', 39.60, true, true),
    ('SAF-3009', 'Warning Beacon LED Amber', 'Safety Equipment', 27.80, true, false),
    ('SAF-3010', 'Safety Fence Panel 2m', 'Safety Equipment', 210.00, true, false),
    ('CTL-4001', 'PLC Compact 24 I/O', 'Automation Controllers', 340.00, true, false),
    ('CTL-4002', 'HMI Touch Panel 7in', 'Automation Controllers', 265.50, true, false),
    ('CTL-4003', 'Servo Drive 1kW', 'Automation Controllers', 410.00, true, false),
    ('CTL-4004', 'Stepper Motor Driver', 'Automation Controllers', 78.40, true, false),
    ('CTL-4005', 'Industrial Ethernet Switch 8-port', 'Automation Controllers', 132.90, true, false),
    ('CTL-4006', 'IO-Link Master 8-port', 'Automation Controllers', 189.00, true, false),
    ('CTL-4007', 'Remote I/O Module 16DI', 'Automation Controllers', 97.60, true, false),
    ('CTL-4008', 'Power Supply 24VDC 10A', 'Automation Controllers', 84.30, true, false),
    ('CTL-4009', 'Frequency Inverter 2.2kW', 'Automation Controllers', 220.00, true, false),
    ('CTL-4010', 'Fieldbus Coupler Profinet', 'Automation Controllers', 105.75, true, true);

INSERT INTO inventory (product_id, warehouse, quantity)
SELECT id, 'Factory-A', 50 + (id * 3) % 200 FROM products;

INSERT INTO inventory (product_id, warehouse, quantity)
SELECT id, 'Factory-B', 20 + (id * 7) % 120 FROM products WHERE id % 2 = 0;

-- Orders: a believable mix, several deliberately inconsistent so Agent B
-- has something real to find (input/03.md) without fabricating a problem.
INSERT INTO orders (customer_ref, status, created_at) VALUES
    ('CUST-1001', 'fulfilled', now() - interval '9 days'),
    ('CUST-1002', 'fulfilled', now() - interval '8 days'),
    ('CUST-1003', 'fulfilled', now() - interval '8 days'),
    ('CUST-1004', 'processing', now() - interval '6 days'),
    ('CUST-1005', 'fulfilled', now() - interval '6 days'),
    ('CUST-1006', 'inconsistent', now() - interval '5 days'),
    ('CUST-1007', 'fulfilled', now() - interval '5 days'),
    ('CUST-1008', 'processing', now() - interval '4 days'),
    ('CUST-1009', 'inconsistent', now() - interval '4 days'),
    ('CUST-1010', 'fulfilled', now() - interval '3 days'),
    ('CUST-1011', 'cancelled', now() - interval '3 days'),
    ('CUST-1012', 'inconsistent', now() - interval '2 days'),
    ('CUST-1013', 'processing', now() - interval '2 days'),
    ('CUST-1014', 'fulfilled', now() - interval '2 days'),
    ('CUST-1015', 'pending', now() - interval '1 day'),
    ('CUST-1016', 'inconsistent', now() - interval '1 day'),
    ('CUST-1017', 'pending', now() - interval '1 day'),
    ('CUST-1018', 'processing', now() - interval '12 hours'),
    ('CUST-1019', 'pending', now() - interval '6 hours'),
    ('CUST-1020', 'inconsistent', now() - interval '3 hours');

-- A handful of order_items per order, cycling through real products.
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
SELECT
    o.id,
    p.id,
    1 + ((o.id + p.id) % 4),
    p.price
FROM orders o
JOIN products p ON p.id = ((o.id * 3 + 1) % 40) + 1
WHERE o.id <= 20;

INSERT INTO order_items (order_id, product_id, quantity, unit_price)
SELECT
    o.id,
    p.id,
    1 + ((o.id + p.id) % 3),
    p.price
FROM orders o
JOIN products p ON p.id = ((o.id * 5 + 7) % 40) + 1
WHERE o.id <= 20 AND o.id % 2 = 0;
