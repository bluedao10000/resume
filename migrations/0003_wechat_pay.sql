CREATE TABLE billing_wechat_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK(plan IN ('plus','pro')),
  total_fen INTEGER NOT NULL CHECK(total_fen > 0),
  app_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  notify_url TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  code_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','closed','paid')),
  transaction_id TEXT UNIQUE,
  period_start INTEGER,
  period_end INTEGER
);
CREATE UNIQUE INDEX wechat_one_pending_order
  ON billing_wechat_orders(user_id) WHERE status='pending';
CREATE INDEX wechat_entitlement_period
  ON billing_wechat_orders(user_id, period_end) WHERE status='paid';
