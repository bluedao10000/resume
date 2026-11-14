CREATE TABLE billing_customers (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL UNIQUE
);
CREATE TABLE billing_subscriptions (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT NOT NULL,
  plan TEXT NOT NULL CHECK(plan IN ('plus','pro')),
  status TEXT NOT NULL,
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE billing_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  plan TEXT NOT NULL,
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  allowance INTEGER NOT NULL,
  reserved INTEGER NOT NULL,
  charged INTEGER NOT NULL DEFAULT 0,
  max_output_tokens INTEGER NOT NULL,
  tariff_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('reserved','settled','released')),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  result_json TEXT,
  created_at INTEGER NOT NULL,
  settled_at INTEGER,
  UNIQUE(user_id, thread_id, request_id)
);
CREATE INDEX billing_runs_period ON billing_runs(user_id, period_start, period_end);
CREATE TABLE billing_webhook_events (
  id TEXT PRIMARY KEY,
  processed_at INTEGER NOT NULL
);
CREATE TABLE billing_sync_locks (
  subscription_id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE billing_checkouts (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  stripe_session_id TEXT,
  url TEXT,
  expires_at INTEGER NOT NULL
);
