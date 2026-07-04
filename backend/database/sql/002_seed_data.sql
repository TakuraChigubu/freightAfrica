-- FreightLink Africa - Seed Data
-- Initial roles, permissions, and system configuration

-- ============================================
-- PERMISSIONS
-- ============================================

-- Users permissions
INSERT INTO permissions (name, description, category) VALUES
('users.view', 'View user profiles', 'users'),
('users.list', 'List users', 'users'),
('users.create', 'Create new users', 'users'),
('users.update', 'Update user profiles', 'users'),
('users.delete', 'Delete users', 'users'),
('users.impersonate', 'Impersonate other users', 'users');

-- Roles permissions
INSERT INTO permissions (name, description, category) VALUES
('roles.view', 'View roles', 'roles'),
('roles.list', 'List roles', 'roles'),
('roles.create', 'Create new roles', 'roles'),
('roles.update', 'Update roles', 'roles'),
('roles.delete', 'Delete roles', 'roles');

-- Organisations permissions
INSERT INTO permissions (name, description, category) VALUES
('organisations.view', 'View organisations', 'organisations'),
('organisations.list', 'List organisations', 'organisations'),
('organisations.create', 'Create organisations', 'organisations'),
('organisations.update', 'Update organisations', 'organisations'),
('organisations.delete', 'Delete organisations', 'organisations'),
('organisations.verify', 'Verify organisations', 'organisations');

-- Loads permissions
INSERT INTO permissions (name, description, category) VALUES
('loads.view', 'View load details', 'loads'),
('loads.list', 'List loads', 'loads'),
('loads.create', 'Create loads', 'loads'),
('loads.update', 'Update loads', 'loads'),
('loads.delete', 'Delete loads', 'loads'),
('loads.unlock', 'Unlock broker contacts', 'loads'),
('loads.moderate', 'Moderate loads (approve/reject)', 'loads'),
('loads.view_all', 'View all loads including unpublished', 'loads');

-- Payments permissions
INSERT INTO permissions (name, description, category) VALUES
('payments.view', 'View payment details', 'payments'),
('payments.list', 'List payments', 'payments'),
('payments.process', 'Process payments', 'payments'),
('payments.refund', 'Refund payments', 'payments'),
('payments.reconcile', 'Reconcile payments', 'payments');

-- Wallets permissions
INSERT INTO permissions (name, description, category) VALUES
('wallets.view', 'View wallet details', 'wallets'),
('wallets.credit', 'Credit wallets', 'wallets'),
('wallets.debit', 'Debit wallets', 'wallets'),
('wallets.transactions', 'View wallet transactions', 'wallets');

-- Disputes permissions
INSERT INTO permissions (name, description, category) VALUES
('disputes.view', 'View disputes', 'disputes'),
('disputes.list', 'List disputes', 'disputes'),
('disputes.create', 'Create disputes', 'disputes'),
('disputes.resolve', 'Resolve disputes', 'disputes');

-- AI & Moderation permissions
INSERT INTO permissions (name, description, category) VALUES
('ai.view_logs', 'View AI parsing logs', 'ai'),
('ai.review', 'Review AI parsing results', 'ai'),
('moderation.view', 'View moderation queue', 'moderation'),
('moderation.process', 'Process moderation queue', 'moderation'),
('moderation.review_fraud', 'Review fraud reports', 'moderation');

-- Analytics permissions
INSERT INTO permissions (name, description, category) VALUES
('analytics.view', 'View analytics dashboards', 'analytics'),
('analytics.export', 'Export analytics data', 'analytics');

-- Settings permissions
INSERT INTO permissions (name, description, category) VALUES
('settings.view', 'View system settings', 'settings'),
('settings.update', 'Update system settings', 'settings');

-- Audit permissions
INSERT INTO permissions (name, description, category) VALUES
('audit.view', 'View audit logs', 'audit'),
('audit.export', 'Export audit logs', 'audit');

-- Subscriptions permissions
INSERT INTO permissions (name, description, category) VALUES
('subscriptions.view', 'View subscriptions', 'subscriptions'),
('subscriptions.manage', 'Manage subscriptions', 'subscriptions');

-- Webhooks permissions
INSERT INTO permissions (name, description, category) VALUES
('webhooks.view', 'View webhook logs', 'webhooks'),
('webhooks.manage', 'Manage webhooks', 'webhooks');

-- ============================================
-- ROLES
-- ============================================

-- Super Admin (Level 10)
INSERT INTO roles (name, description, is_system_role, level) VALUES
('Super Admin', 'Full system access with all permissions', TRUE, 10);

-- Admin (Level 20)
INSERT INTO roles (name, description, is_system_role, level) VALUES
('Admin', 'Administrative access to manage platform', TRUE, 20);

-- Moderator (Level 30)
INSERT INTO roles (name, description, is_system_role, level) VALUES
('Moderator', 'Moderate loads and resolve disputes', TRUE, 30);

-- Finance (Level 40)
INSERT INTO roles (name, description, is_system_role, level) VALUES
('Finance', 'Handle payments, refunds, and financial operations', TRUE, 40);

-- Customer Support (Level 50)
INSERT INTO roles (name, description, is_system_role, level) VALUES
('Customer Support', 'Handle user support and basic operations', TRUE, 50);

-- Broker (Level 100)
INSERT INTO roles (name, description, is_system_role, level) VALUES
('Broker', 'Post and manage freight loads', FALSE, 100);

-- Shipper (Level 100)
INSERT INTO roles (name, description, is_system_role, level) VALUES
('Shipper', 'Browse and unlock loads, manage shipments', FALSE, 100);

-- Transport Company (Level 100)
INSERT INTO roles (name, description, is_system_role, level) VALUES
('Transport Company', 'Browse loads and offer transport services', FALSE, 100);

-- Fleet Owner (Level 100)
INSERT INTO roles (name, description, is_system_role, level) VALUES
('Fleet Owner', 'Manage fleet and bid on loads', FALSE, 100);

-- Driver (Level 100)
INSERT INTO roles (name, description, is_system_role, level) VALUES
('Driver', 'View assigned loads and update delivery status', FALSE, 100);

-- Standard User (Level 200)
INSERT INTO roles (name, description, is_system_role, level) VALUES
('Standard User', 'Basic user with limited access', FALSE, 200);

-- ============================================
-- ROLE PERMISSIONS ASSIGNMENTS
-- ============================================

-- Super Admin gets ALL permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Super Admin';

-- Admin gets most permissions except some super admin ones
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Admin'
AND p.name NOT IN ('users.impersonate', 'settings.update');

-- Moderator permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Moderator'
AND p.name IN (
  'users.view', 'users.list',
  'loads.view', 'loads.list', 'loads.moderate', 'loads.view_all',
  'moderation.view', 'moderation.process', 'moderation.review_fraud',
  'ai.view_logs', 'ai.review',
  'disputes.view', 'disputes.list', 'disputes.resolve',
  'audit.view'
);

-- Finance permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Finance'
AND p.name IN (
  'users.view', 'users.list',
  'loads.view', 'loads.list', 'loads.unlock',
  'payments.view', 'payments.list', 'payments.process', 'payments.refund', 'payments.reconcile',
  'wallets.view', 'wallets.credit', 'wallets.debit', 'wallets.transactions',
  'disputes.view', 'disputes.list', 'disputes.resolve',
  'analytics.view'
);

-- Customer Support permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Customer Support'
AND p.name IN (
  'users.view', 'users.list', 'users.update',
  'loads.view', 'loads.list',
  'disputes.view', 'disputes.list', 'disputes.create', 'disputes.resolve',
  'wallets.view', 'wallets.transactions',
  'audit.view'
);

-- Broker permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Broker'
AND p.name IN (
  'users.view',
  'loads.view', 'loads.list', 'loads.create', 'loads.update',
  'payments.view', 'payments.list',
  'wallets.view', 'wallets.transactions'
);

-- Shipper permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Shipper'
AND p.name IN (
  'users.view',
  'loads.view', 'loads.list', 'loads.unlock',
  'payments.view', 'payments.list', 'payments.process',
  'wallets.view', 'wallets.transactions',
  'disputes.view', 'disputes.create'
);

-- Transport Company permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Transport Company'
AND p.name IN (
  'users.view',
  'loads.view', 'loads.list', 'loads.unlock',
  'payments.view', 'payments.list', 'payments.process',
  'wallets.view', 'wallets.transactions',
  'disputes.view', 'disputes.create'
);

-- Fleet Owner permissions (same as Transport Company)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Fleet Owner'
AND p.name IN (
  'users.view',
  'loads.view', 'loads.list', 'loads.unlock',
  'payments.view', 'payments.list', 'payments.process',
  'wallets.view', 'wallets.transactions',
  'disputes.view', 'disputes.create'
);

-- Driver permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Driver'
AND p.name IN (
  'users.view',
  'loads.view',
  'wallets.view'
);

-- Standard User permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Standard User'
AND p.name IN (
  'users.view',
  'loads.view', 'loads.list',
  'payments.view',
  'wallets.view'
);

-- ============================================
-- LOAD SOURCES
-- ============================================

INSERT INTO load_sources (name, code, description, priority) VALUES
('WhatsApp', 'whatsapp', 'Loads received via WhatsApp Business API', 10),
('Manual Entry', 'manual', 'Manually entered by broker or admin', 20),
('Web Dashboard', 'dashboard', 'Loads posted through web interface', 30),
('API', 'api', 'Loads submitted via public API (future)', 100);

-- ============================================
-- COMMODITY CATEGORIES
-- ============================================

INSERT INTO commodity_categories (name, slug, description, is_hazardous, display_order) VALUES
('General Cargo', 'general-cargo', 'Miscellaneous general freight', FALSE, 10),
('Mining Equipment', 'mining-equipment', 'Equipment and supplies for mining operations', FALSE, 20),
('Mining Ores', 'mining-ores', 'Raw ores and minerals', FALSE, 25),
('Agricultural Products', 'agricultural', 'Farm produce, grains, vegetables', FALSE, 30),
('Livestock', 'livestock', 'Live animals transport', FALSE, 35),
('Perishables', 'perishables', 'Temperature-sensitive goods', FALSE, 40),
('Building Materials', 'building-materials', 'Construction materials', FALSE, 50),
('Fuel & Petroleum', 'fuel-petroleum', 'Fuel, diesel, petroleum products', TRUE, 60),
('Chemicals', 'chemicals', 'Industrial chemicals and substances', TRUE, 70),
('Dangerous Goods', 'dangerous-goods', 'Hazardous materials requiring special handling', TRUE, 80),
('Vehicles', 'vehicles', 'Cars, trucks, and other vehicles', FALSE, 90),
('Machinery', 'machinery', 'Heavy machinery and equipment', FALSE, 100),
('Household Goods', 'household', 'Furniture and household items', FALSE, 110),
('Food & Beverages', 'food-beverages', 'Packaged food and drink products', FALSE, 120),
('Textiles', 'textiles', 'Clothing and fabric products', FALSE, 130),
('Electronics', 'electronics', 'Electronic devices and components', FALSE, 140);

-- ============================================
-- TRUCK TYPES
-- ============================================

INSERT INTO truck_types (name, code, description, capacity_tons, display_order) VALUES
('Tri-axle', 'tri-axle', 'Standard tri-axle truck', 30, 10),
('6-Tonner', '6-tonner', 'Standard 6 ton delivery truck', 6, 20),
('8-Tonner', '8-tonner', 'Standard 8 ton truck', 8, 30),
('10-Tonner', '10-tonner', 'Standard 10 ton truck', 10, 40),
('15-Tonner', '15-tonner', '15 ton truck', 15, 50),
('20-Tonner', '20-tonner', '20 ton truck', 20, 60),
('30-Tonner', '30-tonner', '30 ton heavy truck', 30, 70),
('Horse & Trailer', 'horse-trailer', 'Horse and trailer combination', 34, 80),
('Super Link', 'super-link', 'Super link trailer combination', 36, 90),
('Side Tipper', 'side-tipper', 'Side tipping trailer for bulk loads', 30, 100),
('Flatbed', 'flatbed', 'Flatbed truck for oversized cargo', 25, 110),
('Tanker', 'tanker', 'Liquid transport tanker', 28, 120),
('Refrigerated', 'refrigerated', 'Temperature-controlled truck', 20, 130),
('Lowbed', 'lowbed', 'Lowbed for heavy machinery', 40, 140),
('Interlink', 'interlink', 'Interlink trailer combination', 34, 150);

-- ============================================
-- BORDER CROSSINGS
-- ============================================

INSERT INTO border_crossings (name, code, country_from, country_to) VALUES
('Beitbridge', 'BB', 'South Africa', 'Zimbabwe'),
('Chirundu', 'CH', 'Zimbabwe', 'Zambia'),
('Plumtree', 'PT', 'Botswana', 'Zimbabwe'),
('Kazungula', 'KZ', 'Botswana', 'Zimbabwe'),
('Forbes', 'FB', 'Zimbabwe', 'Mozambique'),
('Nyamapanda', 'NM', 'Zimbabwe', 'Mozambique');

-- ============================================
-- SUBSCRIPTIONS
-- ============================================

INSERT INTO subscriptions (name, slug, description, price_monthly, price_yearly, features, monthly_unlock_limit, monthly_load_limit, team_member_limit) VALUES
(
  'Free',
  'free',
  'Basic access to browse loads',
  0,
  0,
  '{"features": ["Browse loads", "View public load details", "Basic support"], "limitations": ["No contact unlocks included", "Limited search filters"]}',
  5,
  10,
  1
),
(
  'Broker',
  'broker',
  'Perfect for individual brokers posting loads',
  29,
  290,
  '{"features": ["Post unlimited loads", "AI-powered parsing", "Load analytics", "Priority support", "Verified badge"]}',
  NULL,
  NULL,
  3
),
(
  'Logistics Pro',
  'logistics-pro',
  'For transport companies and fleet owners',
  79,
  790,
  '{"features": ["Everything in Broker", "50 contact unlocks/month", "Team collaboration", "Advanced analytics", "API access", "Dedicated support"]}',
  50,
  NULL,
  10
),
(
  'Enterprise',
  'enterprise',
  'Full-featured solution for large operations',
  199,
  1990,
  '{"features": ["Everything in Logistics Pro", "Unlimited unlocks", "Unlimited team members", "Custom integrations", "Phone support", "Account manager", "SLA guarantee"]}',
  NULL,
  NULL,
  NULL
);

-- ============================================
-- SYSTEM SETTINGS
-- ============================================

INSERT INTO system_settings (key, value, description) VALUES
('platform.name', '"FreightLink Africa"', 'Platform display name'),
('platform.support_email', '"support@freightlink.africa"', 'Support email address'),
('platform.default_currency', '"USD"', 'Default currency for the platform'),
('platform.countries', '["Zimbabwe", "South Africa", "Botswana", "Zambia", "Mozambique"]', 'Operating countries'),

('unlock.price', '2.00', 'Price to unlock a load contact in default currency'),
('unlock.duration_hours', '24', 'Hours that unlock access remains valid'),
('unlock.max_unlocks_per_hour', '20', 'Maximum unlocks per user per hour'),

('ai.auto_publish_threshold', '0.95', 'Confidence threshold for auto-publishing'),
('ai.moderation_threshold', '0.70', 'Confidence threshold for moderation queue'),
('ai.reject_threshold', '0.50', 'Confidence threshold for auto-reject'),

('load.expiry_days', '7', 'Days before a published load expires'),
('load.duplicate_similarity_threshold', '0.85', 'Similarity score threshold for duplicate detection'),

('payment.paynow_sandbox', 'true', 'Use Paynow sandbox (testing mode)'),
('payment.wallet_topup_minimum', '5.00', 'Minimum wallet top-up amount'),

('rate_limit.api_general', '100', 'General API rate limit per 15 minutes'),
('rate_limit.auth', '10', 'Authentication endpoint rate limit per 15 minutes'),
('rate_limit.unlock', '20', 'Unlock endpoint rate limit per hour');

-- ============================================
-- LOCATIONS (Sample)
-- ============================================

INSERT INTO locations (name, type, country, province) VALUES
('Harare', 'city', 'Zimbabwe', 'Harare'),
('Bulawayo', 'city', 'Zimbabwe', 'Bulawayo'),
('Mutare', 'city', 'Zimbabwe', 'Manicaland'),
('Gweru', 'city', 'Zimbabwe', 'Midlands'),
('Kwekwe', 'city', 'Zimbabwe', 'Midlands'),
('Kadoma', 'city', 'Zimbabwe', 'Mashonaland West'),
('Chinhoyi', 'city', 'Zimbabwe', 'Mashonaland West'),
('Masvingo', 'city', 'Zimbabwe', 'Masvingo'),
('Chitungwiza', 'city', 'Zimbabwe', 'Harare'),
('Victoria Falls', 'city', 'Zimbabwe', 'Matabeleland North'),

('Johannesburg', 'city', 'South Africa', 'Gauteng'),
('Pretoria', 'city', 'South Africa', 'Gauteng'),
('Durban', 'city', 'South Africa', 'KwaZulu-Natal'),
('Cape Town', 'city', 'South Africa', 'Western Cape'),
('Polokwane', 'city', 'South Africa', 'Limpopo'),
('Nelspruit', 'city', 'South Africa', 'Mpumalanga'),
('Bloemfontein', 'city', 'South Africa', 'Free State'),
('Port Elizabeth', 'city', 'South Africa', 'Eastern Cape'),

('Gaborone', 'city', 'Botswana', 'South East'),
('Francistown', 'city', 'Botswana', 'North East'),

('Lusaka', 'city', 'Zambia', 'Lusaka'),
('Ndola', 'city', 'Zambia', 'Copperbelt'),

('Maputo', 'city', 'Mozambique', 'Maputo'),
('Beira', 'city', 'Mozambique', 'Sofala');
