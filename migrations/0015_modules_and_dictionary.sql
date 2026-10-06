ALTER TABLE bili_categories ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version>0);
CREATE TABLE module_grants (
 user_id TEXT NOT NULL REFERENCES users(id),
 module TEXT NOT NULL CHECK(module IN('review','program','script','characters','dictionary','settings','wishes')),
 granted_by TEXT REFERENCES users(id), granted_at TEXT NOT NULL,
 PRIMARY KEY(user_id,module)
);
-- Existing administrators retain their currently authorized modules.
INSERT INTO module_grants(user_id,module,granted_at) SELECT id,'review',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE role='admin' AND disabled_at IS NULL;
INSERT INTO module_grants(user_id,module,granted_at) SELECT id,'program',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE role='admin' AND disabled_at IS NULL;
INSERT INTO module_grants(user_id,module,granted_at) SELECT id,'script',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE role='admin' AND disabled_at IS NULL;
INSERT INTO module_grants(user_id,module,granted_at) SELECT id,'characters',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE role='admin' AND disabled_at IS NULL;
INSERT INTO module_grants(user_id,module,granted_at) SELECT id,'dictionary',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE role='admin' AND disabled_at IS NULL;
INSERT INTO module_grants(user_id,module,granted_at) SELECT id,'settings',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE role='admin' AND disabled_at IS NULL;
INSERT INTO module_grants(user_id,module,granted_at) SELECT id,'wishes',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM users WHERE role='admin' AND disabled_at IS NULL;
CREATE TRIGGER module_admin_only BEFORE INSERT ON module_grants
WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND role='admin' AND disabled_at IS NULL)
BEGIN SELECT RAISE(ABORT,'module_requires_admin'); END;
CREATE TRIGGER module_grant_immutable BEFORE UPDATE ON module_grants
BEGIN SELECT RAISE(ABORT,'module_grant_immutable'); END;
CREATE TRIGGER modules_removed_on_demotion AFTER UPDATE OF role ON users WHEN NEW.role<>'admin'
BEGIN DELETE FROM module_grants WHERE user_id=NEW.id; END;
CREATE TRIGGER module_added_version AFTER INSERT ON module_grants
BEGIN UPDATE users SET admin_version=admin_version+1 WHERE id=NEW.user_id; END;
CREATE TRIGGER module_removed_version AFTER DELETE ON module_grants
BEGIN UPDATE users SET admin_version=admin_version+1 WHERE id=OLD.user_id; END;
