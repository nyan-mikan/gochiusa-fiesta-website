ALTER TABLE script_blocks ADD COLUMN at_start INTEGER NOT NULL DEFAULT 0 CHECK(at_start IN(0,1) AND (at_start=0 OR (at_end=0 AND before_program_item_id IS NULL)));
ALTER TABLE script_blocks ADD COLUMN auto_generated INTEGER NOT NULL DEFAULT 0 CHECK(auto_generated IN(0,1));
CREATE UNIQUE INDEX automatic_opening_block ON script_blocks(document_id) WHERE auto_generated=1 AND at_start=1 AND deleted_at IS NULL;
CREATE UNIQUE INDEX automatic_program_block ON script_blocks(document_id,before_program_item_id) WHERE auto_generated=1 AND before_program_item_id IS NOT NULL AND deleted_at IS NULL;

-- Existing content and frozen documents remain intact. Unlocking a document
-- fills any missing automatic chapters in the same audited mutation.
INSERT INTO script_blocks(id,document_id,title,at_start,opening,auto_generated,position,anchor_label)
SELECT 'auto:'||lower(hex(randomblob(16))),id,'贺年祭开始',1,1,1,0,'贺年祭开始' FROM script_documents WHERE locked=0;
INSERT INTO script_blocks(id,document_id,title,before_program_item_id,auto_generated,position)
SELECT 'auto:'||lower(hex(randomblob(16))),d.id,'主持段落',pi.id,1,0 FROM script_documents d JOIN program_items pi ON pi.program_id=d.program_id WHERE d.locked=0;
UPDATE script_documents SET structure_version=structure_version+1 WHERE locked=0;
UPDATE programs SET change_seq=change_seq+1 WHERE id IN(SELECT program_id FROM script_documents WHERE locked=0);
INSERT INTO audit_logs(id,actor_id,object_type,object_id,action,summary,created_at)
SELECT 'migration:0010:'||id,NULL,'script',id,'script.auto.initialize','{"source":"database-migration","migration":"0010"}',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM script_documents WHERE locked=0;
