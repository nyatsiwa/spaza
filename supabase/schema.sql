-- ═══════════════════════════════════════════════════════════
-- SPAZA MARKETPLACE — SUPABASE DATABASE SCHEMA
-- Company: Eden Extract (Pty) Ltd t/a Spaza
-- Reg: 2025/756709/07
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── ENUMS ──────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('buyer', 'seller', 'admin');
CREATE TYPE seller_plan AS ENUM ('basic', 'pro', 'elite');
CREATE TYPE seller_status AS ENUM ('pending', 'active', 'suspended', 'terminated');
CREATE TYPE product_status AS ENUM ('draft', 'active', 'out_of_stock', 'removed');
CREATE TYPE order_status AS ENUM ('pending', 'payment_pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');
CREATE TYPE payment_status AS ENUM ('pending', 'complete', 'failed', 'cancelled', 'refunded');
CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'cancelled', 'expired');

-- ─── PROFILES (extends Supabase Auth) ───────────────────────

CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  full_name       TEXT,
  phone           TEXT,
  avatar_url      TEXT,
  role            user_role DEFAULT 'buyer',
  address_line1   TEXT,
  address_line2   TEXT,
  city            TEXT,
  province        TEXT,
  postal_code     TEXT,
  country         TEXT DEFAULT 'ZA',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── SELLER ACCOUNTS ────────────────────────────────────────

CREATE TABLE sellers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  store_name        TEXT NOT NULL,
  store_slug        TEXT UNIQUE NOT NULL,
  store_description TEXT,
  store_logo_url    TEXT,
  store_banner_url  TEXT,
  business_name     TEXT,
  reg_number        TEXT,
  vat_number        TEXT,
  category          TEXT,
  plan              seller_plan DEFAULT 'basic',
  status            seller_status DEFAULT 'pending',
  -- Banking details (encrypted at app level before storage)
  bank_name         TEXT,
  bank_account_number TEXT,
  bank_branch_code  TEXT,
  bank_account_type TEXT,
  -- Stats
  total_sales       DECIMAL(12,2) DEFAULT 0,
  total_orders      INTEGER DEFAULT 0,
  rating            DECIMAL(3,2) DEFAULT 0,
  review_count      INTEGER DEFAULT 0,
  -- Timestamps
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SELLER SUBSCRIPTIONS ───────────────────────────────────

CREATE TABLE seller_subscriptions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id             UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  plan                  seller_plan NOT NULL,
  status                subscription_status DEFAULT 'active',
  -- PayFast subscription details
  payfast_token         TEXT,           -- PayFast recurring billing token
  payfast_subscription_id TEXT,
  amount_cents          INTEGER NOT NULL, -- Monthly fee in cents (ZAR)
  -- Billing cycle
  current_period_start  TIMESTAMPTZ NOT NULL,
  current_period_end    TIMESTAMPTZ NOT NULL,
  next_billing_date     TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Plan details reference
COMMENT ON TABLE seller_subscriptions IS
  'Plans: basic=R199/mo (5% commission), pro=R699/mo (3.5%), elite=R1999/mo (2.5%)';

-- ─── CATEGORIES ─────────────────────────────────────────────

CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  description TEXT,
  icon        TEXT,
  parent_id   UUID REFERENCES categories(id),
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO categories (name, slug, icon, sort_order) VALUES
  ('Electronics',     'electronics',     '📱', 1),
  ('Fashion',         'fashion',         '👗', 2),
  ('Home & Garden',   'home-garden',     '🏠', 3),
  ('Sports & Outdoors','sports',         '⚽', 4),
  ('Books & Media',   'books',           '📚', 5),
  ('Baby & Kids',     'baby-kids',       '👶', 6),
  ('Health & Beauty', 'health-beauty',   '💄', 7),
  ('Groceries',       'groceries',       '🍎', 8),
  ('Automotive',      'automotive',      '🚗', 9),
  ('Toys & Games',    'toys',            '🧸', 10);

-- ─── PRODUCTS ───────────────────────────────────────────────

CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id       UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  category_id     UUID REFERENCES categories(id),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT,
  short_desc      TEXT,
  sku             TEXT,
  barcode         TEXT,
  -- Pricing (stored in cents to avoid floating point issues)
  price_cents     INTEGER NOT NULL,
  compare_price_cents INTEGER,          -- Original / strike-through price
  cost_price_cents    INTEGER,          -- For seller's own records
  -- Inventory
  stock_qty       INTEGER DEFAULT 0,
  track_inventory BOOLEAN DEFAULT TRUE,
  allow_backorder BOOLEAN DEFAULT FALSE,
  -- Status & visibility
  status          product_status DEFAULT 'draft',
  is_featured     BOOLEAN DEFAULT FALSE,
  is_digital      BOOLEAN DEFAULT FALSE,
  -- SEO
  meta_title      TEXT,
  meta_description TEXT,
  -- Images (array of URLs from Supabase Storage)
  images          TEXT[] DEFAULT '{}',
  -- Stats
  view_count      INTEGER DEFAULT 0,
  sale_count      INTEGER DEFAULT 0,
  rating          DECIMAL(3,2) DEFAULT 0,
  review_count    INTEGER DEFAULT 0,
  -- Timestamps
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  -- Unique slug per seller
  UNIQUE(seller_id, slug)
);

-- Product search index
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_featured ON products(is_featured) WHERE is_featured = TRUE;
CREATE INDEX idx_products_search ON products USING GIN (to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- ─── ORDERS ─────────────────────────────────────────────────

CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number    TEXT UNIQUE NOT NULL DEFAULT 'SPZ-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 8)),
  buyer_id        UUID NOT NULL REFERENCES profiles(id),
  -- Shipping address snapshot (denormalised for historical accuracy)
  shipping_name   TEXT NOT NULL,
  shipping_phone  TEXT,
  shipping_line1  TEXT NOT NULL,
  shipping_line2  TEXT,
  shipping_city   TEXT NOT NULL,
  shipping_province TEXT NOT NULL,
  shipping_postal TEXT NOT NULL,
  shipping_country TEXT DEFAULT 'ZA',
  -- Totals (cents)
  subtotal_cents  INTEGER NOT NULL,
  shipping_cents  INTEGER DEFAULT 0,
  discount_cents  INTEGER DEFAULT 0,
  total_cents     INTEGER NOT NULL,
  -- Status
  status          order_status DEFAULT 'pending',
  -- Notes
  buyer_note      TEXT,
  -- Timestamps
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ORDER ITEMS ────────────────────────────────────────────

CREATE TABLE order_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  seller_id       UUID NOT NULL REFERENCES sellers(id),
  -- Snapshot of product at time of purchase
  product_name    TEXT NOT NULL,
  product_image   TEXT,
  sku             TEXT,
  quantity        INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  total_cents     INTEGER NOT NULL,
  -- Commission tracking
  commission_rate DECIMAL(5,4) NOT NULL,  -- e.g. 0.05 = 5%
  commission_cents INTEGER NOT NULL,
  seller_payout_cents INTEGER NOT NULL,   -- total_cents - commission_cents
  -- Fulfilment
  tracking_number TEXT,
  shipped_at      TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PAYMENTS ───────────────────────────────────────────────

CREATE TABLE payments (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id              UUID NOT NULL REFERENCES orders(id),
  -- PayFast ITN (Instant Transaction Notification) data
  payfast_payment_id    TEXT UNIQUE,
  payfast_pf_payment_id TEXT,
  merchant_id           TEXT,
  merchant_key          TEXT,
  amount_cents          INTEGER NOT NULL,
  status                payment_status DEFAULT 'pending',
  -- PayFast response fields
  payment_method        TEXT,           -- cc, dc, eft, etc.
  item_name             TEXT,
  item_description      TEXT,
  -- ITN raw payload for audit
  itn_payload           JSONB,
  -- Timestamps
  paid_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SELLER PAYOUTS ─────────────────────────────────────────

CREATE TABLE seller_payouts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id       UUID NOT NULL REFERENCES sellers(id),
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  gross_cents     INTEGER NOT NULL,
  commission_cents INTEGER NOT NULL,
  net_cents       INTEGER NOT NULL,
  order_count     INTEGER NOT NULL,
  status          TEXT DEFAULT 'pending', -- pending, processing, paid, failed
  reference       TEXT,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── REVIEWS ────────────────────────────────────────────────

CREATE TABLE reviews (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  buyer_id    UUID NOT NULL REFERENCES profiles(id),
  order_id    UUID REFERENCES orders(id),
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title       TEXT,
  body        TEXT,
  is_verified BOOLEAN DEFAULT FALSE,  -- verified purchase
  is_approved BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, buyer_id, order_id)
);

-- Auto-update product rating when review added
CREATE OR REPLACE FUNCTION update_product_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE products SET
    rating = (SELECT AVG(rating) FROM reviews WHERE product_id = NEW.product_id AND is_approved = TRUE),
    review_count = (SELECT COUNT(*) FROM reviews WHERE product_id = NEW.product_id AND is_approved = TRUE)
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_review_change
  AFTER INSERT OR UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_product_rating();

-- ─── WISHLISTS ──────────────────────────────────────────────

CREATE TABLE wishlists (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- ─── ROW LEVEL SECURITY (RLS) ───────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Products: anyone can view active products; sellers manage own
CREATE POLICY "Active products are public" ON products FOR SELECT USING (status = 'active');
CREATE POLICY "Sellers manage own products" ON products FOR ALL USING (
  seller_id IN (SELECT id FROM sellers WHERE user_id = auth.uid())
);

-- Orders: buyers see own orders; sellers see orders containing their products
CREATE POLICY "Buyers see own orders" ON orders FOR SELECT USING (buyer_id = auth.uid());
CREATE POLICY "Sellers see own order items" ON order_items FOR SELECT USING (
  seller_id IN (SELECT id FROM sellers WHERE user_id = auth.uid())
);

-- Wishlists: users manage own
CREATE POLICY "Users manage own wishlist" ON wishlists FOR ALL USING (user_id = auth.uid());

-- Reviews: public read; buyers write own
CREATE POLICY "Reviews are public" ON reviews FOR SELECT USING (is_approved = TRUE);
CREATE POLICY "Buyers write own reviews" ON reviews FOR INSERT WITH CHECK (buyer_id = auth.uid());
