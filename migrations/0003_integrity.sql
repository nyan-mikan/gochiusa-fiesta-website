ALTER TABLE rate_limits ADD COLUMN expires_at TEXT;
CREATE INDEX rate_limit_expiry ON rate_limits(expires_at);
CREATE TRIGGER new_speaker_active_insert BEFORE INSERT ON script_lines
 WHEN NEW.speaker_id IS NOT NULL AND EXISTS(SELECT 1 FROM characters WHERE id=NEW.speaker_id AND archived=1)
 BEGIN SELECT RAISE(ABORT,'character_archived'); END;
CREATE TRIGGER new_speaker_active_update BEFORE UPDATE OF speaker_id ON script_lines
 WHEN NEW.speaker_id IS NOT OLD.speaker_id AND EXISTS(SELECT 1 FROM characters WHERE id=NEW.speaker_id AND archived=1)
 BEGIN SELECT RAISE(ABORT,'character_archived'); END;
CREATE TRIGGER override_scope_insert BEFORE INSERT ON event_character_overrides
 WHEN EXISTS(SELECT 1 FROM characters WHERE id=NEW.character_id AND event_id IS NOT NULL AND event_id<>NEW.event_id)
 BEGIN SELECT RAISE(ABORT,'character_scope'); END;
