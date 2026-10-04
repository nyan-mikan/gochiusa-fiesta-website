ALTER TABLE script_lines ADD COLUMN kind TEXT NOT NULL DEFAULT 'dialogue' CHECK(kind IN ('dialogue','comment','heading'));
-- Preserve historical references and locked snapshots; current views render former narration as comments.
UPDATE characters SET archived=1,version=version+1 WHERE id='aux-narrator';
