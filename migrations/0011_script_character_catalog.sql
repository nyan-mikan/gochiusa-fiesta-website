-- Restore the three speakers explicitly requested by the festival organizer.
-- Existing IDs, aliases, colors, event overrides and historical lines are retained.
UPDATE characters SET archived=0,version=version+1 WHERE id IN('builtin-fuyu','builtin-natsume','builtin-elu') AND archived=1;
UPDATE programs SET change_seq=change_seq+1;
INSERT INTO audit_logs(id,actor_id,object_type,object_id,action,summary,created_at)
VALUES('migration:0011:character-catalog',NULL,'catalog','characters','character.catalog.restore','{"source":"database-migration","migration":"0011","characters":["builtin-fuyu","builtin-natsume","builtin-elu"]}',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
