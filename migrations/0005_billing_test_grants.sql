CREATE TABLE billing_test_grants (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK(plan = 'pro'),
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL CHECK(period_end > period_start)
);
