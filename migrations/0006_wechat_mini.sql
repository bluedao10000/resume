-- Mini Program tokens are hashed at rest; identities are scoped to AppID/openid.
CREATE TABLE wechat_mini_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX wechat_mini_sessions_expiry ON wechat_mini_sessions(expires_at);
