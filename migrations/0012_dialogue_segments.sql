-- Single-speaker legacy rows stay untouched, including frozen documents.
ALTER TABLE script_lines ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'single' CHECK(delivery_mode IN('single','segments') AND (delivery_mode='single' OR (kind='dialogue' AND speaker_id IS NULL AND text='')));
CREATE TABLE script_line_segments (
 id TEXT PRIMARY KEY, line_id TEXT NOT NULL REFERENCES script_lines(id) ON DELETE CASCADE,
 position INTEGER NOT NULL CHECK(position>=0), text TEXT NOT NULL CHECK(length(text)<=5000),
 UNIQUE(line_id,position)
);
CREATE TABLE script_segment_speakers (
 segment_id TEXT NOT NULL REFERENCES script_line_segments(id) ON DELETE CASCADE,
 character_id TEXT NOT NULL REFERENCES characters(id), position INTEGER NOT NULL CHECK(position>=0),
 PRIMARY KEY(segment_id,character_id), UNIQUE(segment_id,position)
);
CREATE INDEX script_segment_speaker_character ON script_segment_speakers(character_id);
CREATE TRIGGER segment_shape_insert BEFORE INSERT ON script_line_segments WHEN NOT EXISTS(SELECT 1 FROM script_lines WHERE id=NEW.line_id AND delivery_mode='segments' AND kind='dialogue') BEGIN SELECT RAISE(ABORT,'segment_shape'); END;
CREATE TRIGGER segment_identity_update BEFORE UPDATE OF line_id ON script_line_segments BEGIN SELECT RAISE(ABORT,'segment_identity'); END;
CREATE TRIGGER segment_speaker_scope BEFORE INSERT ON script_segment_speakers WHEN NOT EXISTS(SELECT 1 FROM characters c JOIN script_line_segments s ON s.id=NEW.segment_id JOIN script_lines l ON l.id=s.line_id JOIN script_blocks b ON b.id=l.block_id JOIN script_documents d ON d.id=b.document_id JOIN programs p ON p.id=d.program_id WHERE c.id=NEW.character_id AND c.id<>'aux-narrator' AND (c.event_id IS NULL OR c.event_id=p.event_id)) BEGIN SELECT RAISE(ABORT,'character_scope'); END;
CREATE TRIGGER segment_speaker_identity_update BEFORE UPDATE ON script_segment_speakers BEGIN SELECT RAISE(ABORT,'segment_speaker_identity'); END;
CREATE TRIGGER locked_segments_insert BEFORE INSERT ON script_line_segments WHEN (SELECT d.locked FROM script_lines l JOIN script_blocks b ON b.id=l.block_id JOIN script_documents d ON d.id=b.document_id WHERE l.id=NEW.line_id)=1 BEGIN SELECT RAISE(ABORT,'script_locked'); END;
CREATE TRIGGER locked_segments_update BEFORE UPDATE ON script_line_segments WHEN (SELECT d.locked FROM script_lines l JOIN script_blocks b ON b.id=l.block_id JOIN script_documents d ON d.id=b.document_id WHERE l.id=OLD.line_id)=1 BEGIN SELECT RAISE(ABORT,'script_locked'); END;
CREATE TRIGGER locked_segments_delete BEFORE DELETE ON script_line_segments WHEN (SELECT d.locked FROM script_lines l JOIN script_blocks b ON b.id=l.block_id JOIN script_documents d ON d.id=b.document_id WHERE l.id=OLD.line_id)=1 BEGIN SELECT RAISE(ABORT,'script_locked'); END;
CREATE TRIGGER locked_segment_speakers_insert BEFORE INSERT ON script_segment_speakers WHEN (SELECT d.locked FROM script_line_segments s JOIN script_lines l ON l.id=s.line_id JOIN script_blocks b ON b.id=l.block_id JOIN script_documents d ON d.id=b.document_id WHERE s.id=NEW.segment_id)=1 BEGIN SELECT RAISE(ABORT,'script_locked'); END;
CREATE TRIGGER locked_segment_speakers_delete BEFORE DELETE ON script_segment_speakers WHEN (SELECT d.locked FROM script_line_segments s JOIN script_lines l ON l.id=s.line_id JOIN script_blocks b ON b.id=l.block_id JOIN script_documents d ON d.id=b.document_id WHERE s.id=OLD.segment_id)=1 BEGIN SELECT RAISE(ABORT,'script_locked'); END;
