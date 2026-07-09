-- Marketplace schema migration
-- Adds marketplace items, unlocks, and admin action logging

-- Marketplace items table
CREATE TABLE IF NOT EXISTS marketplace_items (
  id SERIAL PRIMARY KEY,
  public_id TEXT UNIQUE NOT NULL DEFAULT 'MKT-' || LPAD(nextval('marketplace_items_id_seq'::regclass)::TEXT, 6, '0'::TEXT),
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('vehicle', 'equipment', 'goods', 'other')),
  price NUMERIC(12, 2),
  price_negotiable BOOLEAN DEFAULT false,
  currency VARCHAR(3) DEFAULT 'USD',
  location TEXT NOT NULL,
  country VARCHAR(2),
  contact_phone TEXT NOT NULL,
  contact_whatsapp TEXT,
  contact_email TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'sold', 'expired')),
  image_urls TEXT[],
  attributes JSONB DEFAULT '{}',
  view_count INTEGER DEFAULT 0,
  unlock_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '90 days',
  CONSTRAINT valid_price CHECK (price IS NULL OR price >= 0)
);

CREATE INDEX idx_marketplace_seller ON marketplace_items(seller_id);
CREATE INDEX idx_marketplace_status ON marketplace_items(status);
CREATE INDEX idx_marketplace_category ON marketplace_items(category);
CREATE INDEX idx_marketplace_location ON marketplace_items(location);
CREATE INDEX idx_marketplace_created ON marketplace_items(created_at DESC);

-- Marketplace contact unlocks (reuses credit system)
CREATE TABLE IF NOT EXISTS marketplace_unlocks (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unlock_bundle_id INTEGER REFERENCES unlock_bundles(id),
  price_at_unlock NUMERIC(10, 2) NOT NULL,
  device_fingerprint TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  access_expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  UNIQUE(item_id, user_id)
);

CREATE INDEX idx_marketplace_unlocks_user ON marketplace_unlocks(user_id);
CREATE INDEX idx_marketplace_unlocks_item ON marketplace_unlocks(item_id);

-- Admin action logs
CREATE TABLE IF NOT EXISTS admin_action_logs (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  old_values JSONB,
  new_values JSONB,
  reason TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admin_logs_admin ON admin_action_logs(admin_id);
CREATE INDEX idx_admin_logs_entity ON admin_action_logs(entity_type, entity_id);
CREATE INDEX idx_admin_logs_created ON admin_action_logs(created_at DESC);

-- Trigger for marketplace_items updated_at
CREATE OR REPLACE FUNCTION update_marketplace_item_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marketplace_items_updated_at
  BEFORE UPDATE ON marketplace_items
  FOR EACH ROW
  EXECUTE FUNCTION update_marketplace_item_timestamp();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON marketplace_items TO authenticated;
GRANT SELECT, INSERT ON marketplace_unlocks TO authenticated;
GRANT SELECT ON admin_action_logs TO authenticated;
