CREATE TABLE IF NOT EXISTS allowed_emails (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now()
);
