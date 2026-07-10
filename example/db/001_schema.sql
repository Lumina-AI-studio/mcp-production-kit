-- Nordwind demo domain: a small B2B e-commerce ops SaaS.
--
-- Schema + seed in a single file so it can be dropped into
-- /docker-entrypoint-initdb.d and run once on first boot of the demo
-- Postgres container (see example/docker-compose.yml). This is DEMO data:
-- deterministic ids, obviously fake customers, no PII worth protecting.

CREATE TABLE IF NOT EXISTS customers (
  id         TEXT PRIMARY KEY,
  name       TEXT        NOT NULL,
  email      TEXT        NOT NULL,
  country    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id          TEXT PRIMARY KEY,
  customer_id TEXT        NOT NULL REFERENCES customers (id),
  status      TEXT        NOT NULL CHECK (status IN ('placed', 'paid', 'shipped', 'delivered', 'cancelled')),
  total_cents INTEGER     NOT NULL,
  placed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id          TEXT PRIMARY KEY,
  order_id    TEXT        NOT NULL REFERENCES orders (id),
  amount_cents INTEGER    NOT NULL,
  due_date    DATE        NOT NULL,
  paid_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS refund_requests (
  id           TEXT PRIMARY KEY DEFAULT ('rr_' || substr(md5(random()::text), 1, 10)),
  order_id     TEXT        NOT NULL REFERENCES orders (id),
  amount_cents INTEGER     NOT NULL,
  reason       TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending',
  requested_by TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customers_name_idx ON customers (lower(name));
CREATE INDEX IF NOT EXISTS customers_email_idx ON customers (lower(email));
CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders (customer_id);
CREATE INDEX IF NOT EXISTS invoices_order_idx ON invoices (order_id);
CREATE INDEX IF NOT EXISTS invoices_due_idx ON invoices (due_date) WHERE paid_at IS NULL;
CREATE INDEX IF NOT EXISTS refund_requests_order_idx ON refund_requests (order_id);

-- ---------------------------------------------------------------------------
-- Seed data. Dates are anchored relative to now() so "overdue" stays overdue
-- however long after seeding you boot the stack.
-- ---------------------------------------------------------------------------

INSERT INTO customers (id, name, email, country, created_at) VALUES
  ('cus_ada',   'Ada Lovelace',        'ada@analyticalengine.example',   'GB', now() - INTERVAL '400 days'),
  ('cus_grace', 'Grace Hopper',        'grace@navy.example',             'US', now() - INTERVAL '380 days'),
  ('cus_alan',  'Alan Turing',         'alan@bletchley.example',         'GB', now() - INTERVAL '360 days'),
  ('cus_katherine', 'Katherine Johnson', 'katherine@nasa.example',       'US', now() - INTERVAL '300 days'),
  ('cus_donald', 'Donald Knuth',       'don@stanford.example',           'US', now() - INTERVAL '250 days'),
  ('cus_barbara', 'Barbara Liskov',    'barbara@mit.example',            'US', now() - INTERVAL '200 days'),
  ('cus_edsger', 'Edsger Dijkstra',    'edsger@shortestpath.example',    'NL', now() - INTERVAL '150 days'),
  ('cus_margaret', 'Margaret Hamilton', 'margaret@apollo.example',       'US', now() - INTERVAL '90 days');

INSERT INTO orders (id, customer_id, status, total_cents, placed_at) VALUES
  ('ord_1001', 'cus_ada',       'delivered',  12900, now() - INTERVAL '120 days'),
  ('ord_1002', 'cus_ada',       'paid',       4500,  now() - INTERVAL '40 days'),
  ('ord_1003', 'cus_grace',     'shipped',    23000, now() - INTERVAL '20 days'),
  ('ord_1004', 'cus_grace',     'placed',     8900,  now() - INTERVAL '5 days'),
  ('ord_1005', 'cus_alan',      'delivered',  15000, now() - INTERVAL '100 days'),
  ('ord_1006', 'cus_alan',      'cancelled',  3200,  now() - INTERVAL '80 days'),
  ('ord_1007', 'cus_katherine', 'paid',       54000, now() - INTERVAL '35 days'),
  ('ord_1008', 'cus_katherine', 'placed',     1900,  now() - INTERVAL '2 days'),
  ('ord_1009', 'cus_donald',    'delivered',  9900,  now() - INTERVAL '150 days'),
  ('ord_1010', 'cus_barbara',   'shipped',    47500, now() - INTERVAL '12 days'),
  ('ord_1011', 'cus_barbara',   'paid',       6200,  now() - INTERVAL '25 days'),
  ('ord_1012', 'cus_edsger',    'placed',     3300,  now() - INTERVAL '3 days'),
  ('ord_1013', 'cus_edsger',    'delivered',  28000, now() - INTERVAL '60 days'),
  ('ord_1014', 'cus_margaret',  'paid',       19900, now() - INTERVAL '15 days'),
  ('ord_1015', 'cus_margaret',  'cancelled',  7700,  now() - INTERVAL '10 days');

-- Invoices: several unpaid AND overdue (due_date in the past, paid_at NULL),
-- some unpaid but not yet due, and some paid.
INSERT INTO invoices (id, order_id, amount_cents, due_date, paid_at) VALUES
  ('inv_2001', 'ord_1001', 12900, (now() - INTERVAL '90 days')::date, now() - INTERVAL '95 days'),   -- paid
  ('inv_2002', 'ord_1002', 4500,  (now() - INTERVAL '10 days')::date, NULL),                          -- overdue, unpaid
  ('inv_2003', 'ord_1003', 23000, (now() + INTERVAL '10 days')::date, NULL),                          -- not yet due
  ('inv_2004', 'ord_1005', 15000, (now() - INTERVAL '70 days')::date, now() - INTERVAL '72 days'),    -- paid
  ('inv_2005', 'ord_1007', 54000, (now() - INTERVAL '20 days')::date, NULL),                          -- overdue, unpaid
  ('inv_2006', 'ord_1009', 9900,  (now() - INTERVAL '120 days')::date, now() - INTERVAL '118 days'),  -- paid
  ('inv_2007', 'ord_1010', 47500, (now() - INTERVAL '45 days')::date, NULL),                          -- overdue, unpaid (oldest)
  ('inv_2008', 'ord_1011', 6200,  (now() - INTERVAL '5 days')::date,  NULL),                          -- overdue, unpaid
  ('inv_2009', 'ord_1013', 28000, (now() - INTERVAL '30 days')::date, now() - INTERVAL '28 days'),    -- paid
  ('inv_2010', 'ord_1014', 19900, (now() + INTERVAL '5 days')::date,  NULL);                          -- not yet due

INSERT INTO refund_requests (id, order_id, amount_cents, reason, status, requested_by, created_at) VALUES
  ('rr_seed0001', 'ord_1001', 2900,  'Damaged item on arrival',        'pending',  'demo', now() - INTERVAL '3 days'),
  ('rr_seed0002', 'ord_1005', 15000, 'Wrong product shipped entirely', 'approved', 'demo', now() - INTERVAL '20 days');
