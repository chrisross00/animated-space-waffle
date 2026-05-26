-- 012-apple-sub.sql
-- Stores the stable Apple "sub" (subject) identifier for users who sign in with
-- Apple. Apple only returns the user's email on the FIRST sign-in, so on return
-- sign-ins we look the user up by this stable id instead. Additive only — Google
-- users keep apple_sub NULL.
ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_sub ON users(apple_sub) WHERE apple_sub IS NOT NULL;
