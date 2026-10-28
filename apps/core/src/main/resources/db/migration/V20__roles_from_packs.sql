-- Roles come from the packs (packs/{module}/roles.json), so a state can add a role without a code change.
-- Accounts point at this table; the application writes the rows at start-up.
CREATE TABLE role (
  code  text PRIMARY KEY CHECK (code ~ '^[a-z][a-z_]{1,29}$'),
  label text NOT NULL
);
INSERT INTO role (code, label) VALUES
  ('io','Investigating Officer'), ('front_desk','Front desk'), ('sho','Station House Officer'),
  ('sp','Superintendent of Police'), ('malkhana','Malkhana (evidence store)'), ('prosecutor','Prosecutor'),
  ('state_admin','State admin');
ALTER TABLE app_user DROP CONSTRAINT app_user_role_check;
ALTER TABLE app_user ADD CONSTRAINT app_user_role_fkey FOREIGN KEY (role) REFERENCES role(code);
