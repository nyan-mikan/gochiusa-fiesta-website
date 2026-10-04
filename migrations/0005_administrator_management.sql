-- Base account role and additional administrative capability are independent
-- relations. No existing users, sessions or submission references are rebuilt.
ALTER TABLE users ADD COLUMN admin_version INTEGER NOT NULL DEFAULT 1 CHECK(admin_version>0);
CREATE TABLE user_capabilities (
 user_id TEXT NOT NULL REFERENCES users(id),
 capability TEXT NOT NULL CHECK(capability='manage_admins'),
 granted_by TEXT REFERENCES users(id), granted_at TEXT NOT NULL,
 PRIMARY KEY(user_id,capability)
);
CREATE TRIGGER capability_admin_only BEFORE INSERT ON user_capabilities
WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND role='admin' AND disabled_at IS NULL)
BEGIN SELECT RAISE(ABORT,'capability_requires_admin'); END;
CREATE TRIGGER capability_immutable BEFORE UPDATE ON user_capabilities
BEGIN SELECT RAISE(ABORT,'capability_immutable'); END;
CREATE TRIGGER protect_super_administrator BEFORE UPDATE OF role,disabled_at ON users
WHEN EXISTS(SELECT 1 FROM user_capabilities WHERE user_id=OLD.id AND capability='manage_admins')
AND (NEW.role<>'admin' OR NEW.disabled_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'super_administrator_protected'); END;
CREATE TRIGGER account_role_version AFTER UPDATE OF role ON users WHEN OLD.role<>NEW.role
BEGIN UPDATE users SET admin_version=admin_version+1 WHERE id=NEW.id; END;
CREATE TRIGGER capability_added_version AFTER INSERT ON user_capabilities
BEGIN UPDATE users SET admin_version=admin_version+1 WHERE id=NEW.user_id; END;
CREATE TRIGGER capability_removed_version AFTER DELETE ON user_capabilities
BEGIN UPDATE users SET admin_version=admin_version+1 WHERE id=OLD.user_id; END;
