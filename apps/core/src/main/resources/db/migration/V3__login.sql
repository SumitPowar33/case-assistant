-- Login (25 Oct 2026). Replaces the X-User-Id stand-in.
-- A user signs in with a username and password; only a hash is stored (bcrypt, via Spring Security).
-- A user without a password cannot sign in. An inactive user is refused at once, even with a valid token.
ALTER TABLE app_user
  ADD COLUMN username      text UNIQUE CHECK (username ~ '^[a-z0-9._-]{3,40}$'),
  ADD COLUMN password_hash text CHECK (password_hash IS NULL OR username IS NOT NULL),
  ADD COLUMN active        boolean NOT NULL DEFAULT true;
