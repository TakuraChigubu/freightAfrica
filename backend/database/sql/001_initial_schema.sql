-- FreightLink Africa Database Schema
-- Version: 1.0.0
-- PostgreSQL 15+

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For similarity search

-- ============================================
-- ENUMS
-- ============================================

-- User status
CREATE TYPE user_status AS ENUM ('pending', 'active', 'suspended', 'deleted');

-- Load status
CREATE TYPE load_status AS ENUM (
  'pending_review',
  'moderation',
  'published',
  'expired',
  'allocated',
  'rejected',
  'fraud'
);

-- Payment status
CREATE TYPE payment_status AS ENUM (
  'initiated',
  'pending',
  'processing',
  'confirmed',
  'failed',
  'cancelled',
  'refunded',
  'reconciled'
);

-- Payment method
CREATE TYPE payment_method AS ENUM (
  'ecocash',
  'onemoney',
  'zipit',
  'card',
  'wallet'
);

-- Unlock status
CREATE TYPE unlock_status AS ENUM ('active', 'expired', 'refunded');

-- Dispute status
CREATE TYPE dispute_status AS ENUM ('open', 'under_review', 'resolved', 'closed');

-- AI parsing confidence level
CREATE TYPE confidence_level AS ENUM ('high', 'medium', 'low', 'failed');

-- Subscription status
CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'cancelled', 'expired');

-- Organisation type
CREATE TYPE organisation_type AS ENUM (
  'broker',
  'shipper',
  'transport_company',
  'fleet_owner',
  'freight_forwarder',
  'logistics_company'
);

-- ============================================
-- TABLES
-- ============================================

-- Permissions
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  category VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Roles
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  is_system_role BOOLEAN NOT NULL DEFAULT FALSE,
  level INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Role permissions (many-to-many)
CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

-- Organisations
CREATE TABLE organisations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  logo_url TEXT,
  description TEXT,
  organisation_type organisation_type NOT NULL,
  country VARCHAR(100) NOT NULL,
  province VARCHAR(100),
  city VARCHAR(100),
  address TEXT,
  phone VARCHAR(50),
  email VARCHAR(255),
  vat_number VARCHAR(50),
  registration_number VARCHAR(100),
  website VARCHAR(255),
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  subscription_id UUID REFERENCES subscriptions(id),
  settings JSONB NOT NULL DEFAULT '{}',
  created_by UUID, -- Will add FK after users table
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified_at TIMESTAMPTZ,
  password_hash VARCHAR(255),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  display_name VARCHAR(200),
  avatar_url TEXT,
  phone VARCHAR(50),
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified_at TIMESTAMPTZ,
  status user_status NOT NULL DEFAULT 'pending',
  google_id VARCHAR(255) UNIQUE,
  google_data JSONB,
  locale VARCHAR(10) DEFAULT 'en',
  timezone VARCHAR(50) DEFAULT 'Africa/Johannesburg',
  role_id UUID NOT NULL REFERENCES roles(id),
  organisation_id UUID REFERENCES organisations(id),
  last_login_at TIMESTAMPTZ,
  last_login_ip INET,
  login_count INTEGER NOT NULL DEFAULT 0,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  preferences JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK for organisations.created_by
ALTER TABLE organisations ADD CONSTRAINT fk_organisations_created_by
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- Email verification tokens
CREATE TABLE email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_email_verification_tokens_token ON email_verification_tokens(token);
CREATE INDEX idx_email_verification_tokens_user ON email_verification_tokens(user_id);

-- Password reset tokens
CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id);

-- Refresh tokens (database backup for Redis sessions)
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  device_info JSONB,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  revoked_reason VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- Load sources
CREATE TABLE load_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  code VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Commodity categories
CREATE TABLE commodity_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  parent_id UUID REFERENCES commodity_categories(id) ON DELETE SET NULL,
  is_hazardous BOOLEAN NOT NULL DEFAULT FALSE,
  icon VARCHAR(50),
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_commodity_categories_parent ON commodity_categories(parent_id);

-- Truck types
CREATE TABLE truck_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  code VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  capacity_tons DECIMAL(10,2),
  dimensions VARCHAR(100),
  icon VARCHAR(50),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Border crossings
CREATE TABLE border_crossings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  country_from VARCHAR(100) NOT NULL,
  country_to VARCHAR(100) NOT NULL,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  operating_hours VARCHAR(200),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Locations
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- city, town, warehouse, port, etc.
  country VARCHAR(100) NOT NULL,
  province VARCHAR(100),
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  normalized_name VARCHAR(255),
  search_vector TSVECTOR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_locations_search ON locations USING GIN(search_vector);
CREATE INDEX idx_locations_name ON locations(normalized_name);
CREATE INDEX idx_locations_country ON locations(country);

-- Loads
CREATE TABLE loads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  public_id VARCHAR(20) NOT NULL UNIQUE, -- Human-friendly ID (FL-XXXXX)

  -- Route information
  origin_location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  origin_raw VARCHAR(255) NOT NULL,
  origin_country VARCHAR(100),
  destination_location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  destination_raw VARCHAR(255) NOT NULL,
  destination_country VARCHAR(100),
  border_crossing_id UUID REFERENCES border_crossings(id) ON DELETE SET NULL,

  -- Cargo information
  cargo_type VARCHAR(200),
  commodity_category_id UUID REFERENCES commodity_categories(id) ON DELETE SET NULL,
  description TEXT,
  weight_kg DECIMAL(12,2),
  weight_verified BOOLEAN NOT NULL DEFAULT FALSE,

  -- Transport requirements
  truck_type_id UUID REFERENCES truck_types(id) ON DELETE SET NULL,
  truck_type_raw VARCHAR(100),
  number_of_trucks INTEGER NOT NULL DEFAULT 1,

  -- Dates
  pickup_date DATE,
  pickup_date_flexible BOOLEAN NOT NULL DEFAULT FALSE,
  delivery_date DATE,
  delivery_date_flexible BOOLEAN NOT NULL DEFAULT FALSE,

  -- Hazardous materials
  is_hazardous BOOLEAN NOT NULL DEFAULT FALSE,
  hazardous_class VARCHAR(50),
  hazardous_notes TEXT,

  -- Pricing
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  price DECIMAL(15,2),
  price_per_ton DECIMAL(15,2),
  price_negotiable BOOLEAN NOT NULL DEFAULT FALSE,
  ai_estimated_price DECIMAL(15,2),

  -- Source and broker
  load_source_id UUID REFERENCES load_sources(id) ON DELETE SET NULL,
  source_reference VARCHAR(255),
  source_raw_message TEXT,
  source_message_id VARCHAR(255),
  raw_phone VARCHAR(100),
  raw_whatsapp VARCHAR(100),
  parsed_phone VARCHAR(50),
  parsed_whatsapp VARCHAR(50),
  broker_name VARCHAR(255),
  broker_company VARCHAR(255),
  broker_email VARCHAR(255),
  broker_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Special instructions
  special_instructions TEXT,
  internal_notes TEXT,

  -- AI parsing
  ai_parsed BOOLEAN NOT NULL DEFAULT FALSE,
  ai_confidence DECIMAL(5,2),
  ai_confidence_level confidence_level,
  ai_raw_response JSONB,
  ai_model VARCHAR(100),
  ai_parsed_at TIMESTAMPTZ,
  ai_needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  ai_review_reason TEXT,

  -- Status
  status load_status NOT NULL DEFAULT 'pending_review',
  status_reason TEXT,
  status_changed_at TIMESTAMPTZ,
  status_changed_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Fraud detection
  fraud_score DECIMAL(5,2),
  fraud_flags JSONB NOT NULL DEFAULT '[]',
  fraud_checked_at TIMESTAMPTZ,

  -- Duplicate detection
  duplicate_score DECIMAL(5,2),
  duplicate_of_id UUID REFERENCES loads(id) ON DELETE SET NULL,
  duplicate_checked_at TIMESTAMPTZ,

  -- Moderation
  moderated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  moderated_at TIMESTAMPTZ,
  moderator_notes TEXT,

  -- Publication
  published_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  -- Statistics
  view_count INTEGER NOT NULL DEFAULT 0,
  unlock_count INTEGER NOT NULL DEFAULT 0,

  -- Audit
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for loads
CREATE INDEX idx_loads_public_id ON loads(public_id);
CREATE INDEX idx_loads_status ON loads(status);
CREATE INDEX idx_loads_created_at ON loads(created_at DESC);
CREATE INDEX idx_loads_pickup_date ON loads(pickup_date);
CREATE INDEX idx_loads_origin_country ON loads(origin_country);
CREATE INDEX idx_loads_destination_country ON loads(destination_country);
CREATE INDEX idx_loads_broker_user ON loads(broker_user_id);
CREATE INDEX idx_loads_source ON loads(load_source_id);
CREATE INDEX idx_loads_ai_confidence ON loads(ai_confidence);
CREATE INDEX idx_loads_duplicate_of ON loads(duplicate_of_id);
CREATE INDEX idx_loads_expires_at ON loads(expires_at);

-- Full-text search index
CREATE INDEX idx_loads_search ON loads USING GIN(
  to_tsvector('english', origin_raw || ' ' || destination_raw || ' ' || COALESCE(cargo_type, '') || ' ' || COALESCE(description, ''))
);

-- WhatsApp messages (raw incoming messages)
CREATE TABLE whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id VARCHAR(255) NOT NULL UNIQUE,
  from_phone VARCHAR(50) NOT NULL,
  to_phone VARCHAR(50) NOT NULL,
  message_type VARCHAR(50) NOT NULL,
  message_body TEXT,
  media_url TEXT,
  media_type VARCHAR(50),
  timestamp TIMESTAMPTZ NOT NULL,
  status VARCHAR(50),
  status_timestamp TIMESTAMPTZ,
  raw_data JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  load_id UUID REFERENCES loads(id) ON DELETE SET NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_whatsapp_messages_from ON whatsapp_messages(from_phone);
CREATE INDEX idx_whatsapp_messages_timestamp ON whatsapp_messages(timestamp DESC);
CREATE INDEX idx_whatsapp_messages_processed ON whatsapp_messages(processed);
CREATE INDEX idx_whatsapp_messages_load ON whatsapp_messages(load_id);

-- AI parsing logs
CREATE TABLE ai_parsing_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_id UUID REFERENCES loads(id) ON DELETE SET NULL,
  whatsapp_message_id UUID REFERENCES whatsapp_messages(id) ON DELETE SET NULL,
  input_text TEXT NOT NULL,
  input_type VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  raw_response JSONB NOT NULL,
  parsed_data JSONB,
  confidence_score DECIMAL(5,2),
  confidence_level confidence_level,
  parsing_success BOOLEAN NOT NULL,
  error_message TEXT,
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ai_parsing_logs_load ON ai_parsing_logs(load_id);
CREATE INDEX idx_ai_parsing_logs_created ON ai_parsing_logs(created_at DESC);

-- Moderation queue
CREATE TABLE moderation_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_id UUID NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  category VARCHAR(50) NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution VARCHAR(50),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_moderation_queue_status ON moderation_queue(resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX idx_moderation_queue_assigned ON moderation_queue(assigned_to) WHERE resolved_at IS NULL;
CREATE INDEX idx_moderation_queue_load ON moderation_queue(load_id);

-- Wallets
CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  balance DECIMAL(15,2) NOT NULL DEFAULT 0,
  pending_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_credited DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_debited DECIMAL(15,2) NOT NULL DEFAULT 0,
  last_transaction_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_wallets_user ON wallets(user_id);

-- Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  public_id VARCHAR(30) NOT NULL UNIQUE, -- Human-friendly reference
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,

  -- Amount
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',

  -- Payment method
  payment_method payment_method NOT NULL,
  payment_method_detail VARCHAR(100), -- e.g., phone number for EcoCash

  -- Paynow reference
  paynow_reference VARCHAR(100),
  paynow_poll_url TEXT,

  -- Status
  status payment_status NOT NULL DEFAULT 'initiated',
  status_reason TEXT,
  status_changed_at TIMESTAMPTZ,

  -- Purpose
  purpose VARCHAR(50) NOT NULL, -- 'unlock', 'wallet_topup', 'subscription'
  reference_id UUID, -- Related entity (load_id for unlock, etc.)
  reference_type VARCHAR(50),

  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}',

  -- Idempotency
  idempotency_key VARCHAR(255),

  -- Reconciliation
  reconciled BOOLEAN NOT NULL DEFAULT FALSE,
  reconciled_at TIMESTAMPTZ,

  -- Refund
  refunded_amount DECIMAL(15,2),
  refunded_at TIMESTAMPTZ,
  refund_reason TEXT,

  -- Audit
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_public_id ON payments(public_id);
CREATE INDEX idx_payments_paynow_ref ON payments(paynow_reference);
CREATE INDEX idx_payments_created ON payments(created_at DESC);
CREATE INDEX idx_payments_reference ON payments(reference_id, reference_type);
CREATE INDEX idx_payments_idempotency ON payments(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Wallet transactions
CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'credit', 'debit', 'refund'
  amount DECIMAL(15,2) NOT NULL,
  balance_before DECIMAL(15,2) NOT NULL,
  balance_after DECIMAL(15,2) NOT NULL,
  reference_type VARCHAR(50),
  reference_id UUID,
  description TEXT,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_wallet_transactions_wallet ON wallet_transactions(wallet_id);
CREATE INDEX idx_wallet_transactions_created ON wallet_transactions(created_at DESC);
CREATE INDEX idx_wallet_transactions_ref ON wallet_transactions(reference_id, reference_type);

-- Contact unlocks
CREATE TABLE contact_unlocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  load_id UUID NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  wallet_transaction_id UUID REFERENCES wallet_transactions(id) ON DELETE SET NULL,

  -- Access info
  access_expires_at TIMESTAMPTZ NOT NULL,
  status unlock_status NOT NULL DEFAULT 'active',

  -- Verified contact data
  phone VARCHAR(50),
  whatsapp VARCHAR(50),
  broker_name VARCHAR(255),
  broker_company VARCHAR(255),
  broker_email VARCHAR(255),

  -- Device fingerprinting for anti-leakage
  device_fingerprint VARCHAR(255),
  ip_address INET,
  user_agent TEXT,

  -- Refund
  refund_reason TEXT,
  refunded_at TIMESTAMPTZ,
  refunded_by UUID REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One active unlock per user per load
  UNIQUE (user_id, load_id) WHERE status = 'active'
);
CREATE INDEX idx_unlocks_user ON contact_unlocks(user_id);
CREATE INDEX idx_unlocks_load ON contact_unlocks(load_id);
CREATE INDEX idx_unlocks_expires ON contact_unlocks(access_expires_at);
CREATE INDEX idx_unlocks_status ON contact_unlocks(status);

-- Disputes
CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  public_id VARCHAR(20) NOT NULL UNIQUE,
  unlock_id UUID NOT NULL REFERENCES contact_unlocks(id) ON DELETE CASCADE,
  load_id UUID NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  opened_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Issue details
  dispute_type VARCHAR(50) NOT NULL, -- 'invalid_phone', 'wrong_contact', 'duplicate', 'fraud', etc.
  description TEXT NOT NULL,
  evidence_urls TEXT[],

  -- Status
  status dispute_status NOT NULL DEFAULT 'open',

  -- Resolution
  resolution_type VARCHAR(50), -- 'refund', 'credit', 'rejected', etc.
  resolution_notes TEXT,
  refund_amount DECIMAL(15,2),
  wallet_credit_amount DECIMAL(15,2),

  -- Assignment
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,

  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_disputes_status ON disputes(status);
CREATE INDEX idx_disputes_unlock ON disputes(unlock_id);
CREATE INDEX idx_disputes_load ON disputes(load_id);
CREATE INDEX idx_disputes_opened_by ON disputes(opened_by);

-- Subscriptions
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,

  -- Pricing
  price_monthly DECIMAL(15,2) NOT NULL,
  price_yearly DECIMAL(15,2),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',

  -- Features
  features JSONB NOT NULL DEFAULT '{}',

  -- Limits
  monthly_unlock_limit INTEGER,
  monthly_load_limit INTEGER,
  team_member_limit INTEGER,

  -- Settings
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Organisation subscriptions
CREATE TABLE organisation_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,

  status subscription_status NOT NULL DEFAULT 'active',

  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,

  monthly_unlocks_used INTEGER NOT NULL DEFAULT 0,
  monthly_loads_used INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_org_subscriptions_org ON organisation_subscriptions(organisation_id);
CREATE INDEX idx_org_subscriptions_status ON organisation_subscriptions(status);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  sent_via VARCHAR(50)[] DEFAULT ARRAY['in_app'],
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(user_id, read);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- Notification preferences
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  preferences JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  organisation_id UUID REFERENCES organisations(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  request_id VARCHAR(100),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_org ON audit_logs(organisation_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- Fraud reports
CREATE TABLE fraud_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_id UUID NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  action_taken VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_fraud_reports_load ON fraud_reports(load_id);
CREATE INDEX idx_fraud_reports_status ON fraud_reports(status);

-- Duplicate detection cache
CREATE TABLE duplicate_detection_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_id UUID NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  phone_normalized VARCHAR(50),
  route_hash VARCHAR(64),
  cargo_hash VARCHAR(64),
  price_range VARCHAR(50),
  time_bucket VARCHAR(50),
  embedding VECTOR(1536), -- For semantic similarity (requires pgvector extension)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_duplicate_cache_load ON duplicate_detection_cache(load_id);
CREATE INDEX idx_duplicate_cache_phone ON duplicate_detection_cache(phone_normalized);
CREATE INDEX idx_duplicate_cache_route ON duplicate_detection_cache(route_hash);

-- System settings
CREATE TABLE system_settings (
  key VARCHAR(100) NOT NULL PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_permissions_updated_at BEFORE UPDATE ON permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organisations_updated_at BEFORE UPDATE ON organisations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_load_sources_updated_at BEFORE UPDATE ON load_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_moderation_queue_updated_at BEFORE UPDATE ON moderation_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_unlocks_updated_at BEFORE UPDATE ON contact_unlocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_disputes_updated_at BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_org_subscriptions_updated_at BEFORE UPDATE ON organisation_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fraud_reports_updated_at BEFORE UPDATE ON fraud_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Generate public_id for loads
CREATE OR REPLACE FUNCTION generate_load_public_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' THEN
    NEW.public_id = 'FL-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT) FROM 1 FOR 6));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_load_public_id_trigger BEFORE INSERT ON loads
  FOR EACH ROW EXECUTE FUNCTION generate_load_public_id();

-- Generate public_id for payments
CREATE OR REPLACE FUNCTION generate_payment_public_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' THEN
    NEW.public_id = 'PAY-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT) FROM 1 FOR 6));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_payment_public_id_trigger BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION generate_payment_public_id();

-- Update location search vector
CREATE OR REPLACE FUNCTION update_location_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector = to_tsvector('english', COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.country, '') || ' ' || COALESCE(NEW.province, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_location_search_vector_trigger BEFORE INSERT OR UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION update_location_search_vector();

-- Normalize phone numbers
CREATE OR REPLACE FUNCTION normalize_phone(VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
  RETURN REGEXP_REPLACE(REGEXP_REPLACE($1, '[^0-9+]', '', 'g'), '^(0|\+263)', '+263');
END;
$$ LANGUAGE plpgsql IMMUTABLE;
