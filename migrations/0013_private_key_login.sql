-- Private material is generated and retained only in the browser.
CREATE TABLE account_login_keys (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 public_key TEXT NOT NULL UNIQUE,
 fingerprint TEXT NOT NULL,
 created_at TEXT NOT NULL,
 revoked_at TEXT
);
CREATE UNIQUE INDEX account_login_keys_active ON account_login_keys(user_id) WHERE revoked_at IS NULL;
CREATE TABLE key_email_challenges (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 session_hash TEXT NOT NULL REFERENCES sessions(token_hash),
 key_id TEXT NOT NULL UNIQUE,
 expected_key_id TEXT NOT NULL,
 message TEXT NOT NULL,
 code_hash TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 used_at TEXT,
 created_at TEXT NOT NULL
);
CREATE INDEX key_email_challenges_user ON key_email_challenges(user_id,created_at);
CREATE INDEX key_email_challenges_expiry ON key_email_challenges(expires_at);
CREATE TABLE login_key_challenges (
 id TEXT PRIMARY KEY,
 key_id TEXT NOT NULL REFERENCES account_login_keys(id),
 message TEXT NOT NULL,
 ip_hash TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 used_at TEXT,
 created_at TEXT NOT NULL
);
CREATE INDEX login_key_challenges_expiry ON login_key_challenges(expires_at);
CREATE TABLE key_sessions (
 token_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash),
 key_id TEXT NOT NULL REFERENCES account_login_keys(id)
);
CREATE INDEX key_sessions_key ON key_sessions(key_id);
