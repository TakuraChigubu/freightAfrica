-- FreightLink Africa - Pricing & Bundles Schema
-- Version: 003
-- Monetization layer: Pay-per-unlock with bundle pricing

-- ============================================
-- LOAD COST TRACKING
-- Track actual processing costs per load
-- ============================================

CREATE TABLE load_cost_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_id UUID NOT NULL UNIQUE REFERENCES loads(id) ON DELETE CASCADE,

  -- WhatsApp Business API costs
  whatsapp_cost DECIMAL(10,6) NOT NULL DEFAULT 0.04,
  whatsapp_message_id VARCHAR(255),

  -- Gemini API costs
  gemini_input_cost DECIMAL(10,6) NOT NULL DEFAULT 0,
  gemini_output_cost DECIMAL(10,6) NOT NULL DEFAULT 0,
  gemini_tokens_input INTEGER DEFAULT 0,
  gemini_tokens_output INTEGER DEFAULT 0,

  -- Total calculated cost
  total_cost DECIMAL(10,6) NOT NULL DEFAULT 0,

  -- Processing metrics
  processing_time_ms INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_load_cost_tracking_load ON load_cost_tracking(load_id);
CREATE INDEX idx_load_cost_tracking_created ON load_cost_tracking(created_at DESC);

-- Updated at trigger
CREATE TRIGGER update_load_cost_tracking_updated_at BEFORE UPDATE ON load_cost_tracking
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- UNLOCK BUNDLES PURCHASED
-- Users purchase bundles of unlocks
-- ============================================

CREATE TABLE unlock_bundles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  public_id VARCHAR(30) NOT NULL UNIQUE, -- Human-friendly: UB-XXXX-XXXX
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,

  -- Bundle details
  bundle_type VARCHAR(50) NOT NULL, -- 'single', 'bundle_3', 'bundle_5', 'bundle_10'
  bundle_name VARCHAR(100) NOT NULL,
  total_unlocks INTEGER NOT NULL CHECK (total_unlocks > 0),
  price_paid DECIMAL(15,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',

  -- Cost tracking for this bundle sale
  cost_per_unlock_at_purchase DECIMAL(10,6) NOT NULL,
  paynow_fee_paid DECIMAL(10,4) NOT NULL DEFAULT 0,

  -- Remaining credits
  unlocks_remaining INTEGER NOT NULL,
  unlocks_used INTEGER NOT NULL DEFAULT 0,

  -- Validity
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ, -- Optional expiry for promotional bundles
  fully_consumed_at TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_unlock_bundles_user ON unlock_bundles(user_id);
CREATE INDEX idx_unlock_bundles_payment ON unlock_bundles(payment_id);
CREATE INDEX idx_unlock_bundles_active ON unlock_bundles(user_id, is_active, unlocks_remaining)
  WHERE is_active = TRUE AND unlocks_remaining > 0;
CREATE INDEX idx_unlock_bundles_public_id ON unlock_bundles(public_id);

-- Updated at trigger
CREATE TRIGGER update_unlock_bundles_updated_at BEFORE UPDATE ON unlock_bundles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Generate public_id for unlock bundles
CREATE OR REPLACE FUNCTION generate_unlock_bundle_public_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' THEN
    NEW.public_id = 'UB-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT) FROM 1 FOR 4));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_unlock_bundle_public_id_trigger BEFORE INSERT ON unlock_bundles
  FOR EACH ROW EXECUTE FUNCTION generate_unlock_bundle_public_id();

-- ============================================
-- UNLOCK CREDITS AGGREGATE VIEW
-- Simplified view of user's available credits
-- ============================================

CREATE VIEW user_unlock_credits AS
SELECT
  user_id,
  SUM(unlocks_remaining) as total_credits,
  COUNT(*) FILTER (WHERE expires_at > NOW() OR expires_at IS NULL) as active_bundles,
  MIN(expires_at) as earliest_expiry
FROM unlock_bundles
WHERE is_active = TRUE AND unlocks_remaining > 0
GROUP BY user_id;

-- ============================================
-- CONTACT UNLOCKS - Add bundle reference
-- ============================================

ALTER TABLE contact_unlocks
  ADD COLUMN IF NOT EXISTS unlock_bundle_id UUID REFERENCES unlock_bundles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price_at_unlock DECIMAL(10,2);

-- ============================================
-- PAYMENTS - Add bundle purpose
-- ============================================

-- Update payments table to support bundle purchases
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS bundle_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS unlocks_purchased INTEGER DEFAULT 0;

-- ============================================
-- SYSTEM SETTINGS - Pricing configuration
-- ============================================

INSERT INTO system_settings (key, value, description) VALUES
(
  'pricing_config',
  '{
    "bundles": {
      "single": {"unlocks": 1, "price": 3.50, "name": "Single Unlock"},
      "bundle_3": {"unlocks": 3, "price": 10.00, "name": "3 Unlocks Pack", "isDefault": true},
      "bundle_5": {"unlocks": 5, "price": 15.00, "name": "5 Unlocks Pack"},
      "bundle_10": {"unlocks": 10, "price": 25.00, "name": "10 Unlocks Pack"}
    },
    "costs": {
      "whatsapp_conversation": 0.04,
      "gemini_per_parse": 0.001,
      "paynow_flat_fee": 0.50,
      "paynow_percentage": 1.5
    },
    "unlock_duration_hours": 24,
    "min_price_threshold": 3.00
  }'::jsonb,
  'Pricing configuration for unlock bundles'
), (
  'conversion_rates',
  '{
    "assumed_rate": 0.10,
    "actual_rate_locked": false,
    "data_collection_started": "2025-07-08"
  }'::jsonb,
  'Conversion rate tracking for pricing optimization'
) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE load_cost_tracking IS
'Tracks actual processing costs per load (WhatsApp + Gemini) for pricing validation';

COMMENT ON TABLE unlock_bundles IS
'Prepaid unlock bundles purchased by users. Credits consumed on contact unlock';

COMMENT ON COLUMN unlock_bundles.cost_per_unlock_at_purchase IS
'Snapshot of processing cost per unlock at time of purchase, for margin analysis';

COMMENT ON COLUMN unlock_bundles.paynow_fee_paid IS
'Actual Paynow fee for this transaction, for fee ratio tracking';

COMMENT ON COLUMN contact_unlocks.unlock_bundle_id IS
'Which prepaid bundle this unlock was debited from, if any';

-- ============================================
-- PARTIAL INDEX FOR EFFICIENT CREDIT CHECKS
-- ============================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unlock_bundles_credits_available
  ON unlock_bundles(user_id, unlocks_remaining DESC)
  WHERE is_active = TRUE AND unlocks_remaining > 0;
