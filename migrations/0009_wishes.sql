ALTER TABLE events ADD COLUMN wishes_open INTEGER NOT NULL DEFAULT 1 CHECK(wishes_open IN(0,1));
CREATE TABLE wishes (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id),
 owner_user_id TEXT NOT NULL REFERENCES users(id), display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 80),
 text TEXT NOT NULL DEFAULT '' CHECK(length(text)<=2000),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','submitted')),
 version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, submitted_at TEXT,
 CHECK((status='draft' AND submitted_at IS NULL) OR (status='submitted' AND submitted_at IS NOT NULL))
);
CREATE INDEX wishes_event_status ON wishes(event_id,status,submitted_at,id);
CREATE INDEX wishes_owner ON wishes(owner_user_id,event_id,created_at);
CREATE TABLE wish_audio (
 wish_id TEXT PRIMARY KEY REFERENCES wishes(id), object_key TEXT NOT NULL UNIQUE,
 filename TEXT NOT NULL, content_type TEXT NOT NULL,
 size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 20971520), sha256 TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TRIGGER wish_frozen BEFORE UPDATE ON wishes WHEN OLD.status='submitted'
BEGIN SELECT RAISE(ABORT,'wish_frozen'); END;
CREATE TRIGGER wish_audio_guard BEFORE INSERT ON wish_audio
WHEN NOT EXISTS(SELECT 1 FROM wishes w JOIN users u ON u.id=w.owner_user_id WHERE w.id=NEW.wish_id AND w.status='draft' AND u.role='admin' AND u.disabled_at IS NULL)
BEGIN SELECT RAISE(ABORT,'wish_audio_not_allowed'); END;
CREATE TRIGGER wish_submit_guard BEFORE UPDATE OF status ON wishes
WHEN NEW.status='submitted' AND trim(NEW.text)='' AND NOT EXISTS(SELECT 1 FROM wish_audio WHERE wish_id=NEW.id)
BEGIN SELECT RAISE(ABORT,'wish_content_required'); END;
CREATE TRIGGER wish_audio_immutable BEFORE UPDATE ON wish_audio
BEGIN SELECT RAISE(ABORT,'wish_audio_immutable'); END;
CREATE TRIGGER wish_audio_delete_guard BEFORE DELETE ON wish_audio
WHEN EXISTS(SELECT 1 FROM wishes WHERE id=OLD.wish_id AND status='submitted')
BEGIN SELECT RAISE(ABORT,'wish_frozen'); END;
