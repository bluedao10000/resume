CREATE TABLE billing_alipay_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK(plan IN ('plus','pro')),
  total_fen INTEGER NOT NULL CHECK(total_fen > 0),
  app_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('sandbox','production')),
  expires_at INTEGER NOT NULL,
  checked_at INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','closed','paid','refund_pending','refunded')),
  trade_no TEXT UNIQUE,
  period_start INTEGER,
  period_end INTEGER
);
CREATE UNIQUE INDEX alipay_one_pending_order
  ON billing_alipay_orders(user_id, mode, app_id) WHERE status='pending';
CREATE INDEX alipay_entitlement_period
  ON billing_alipay_orders(user_id, mode, app_id, period_end) WHERE status='paid';
