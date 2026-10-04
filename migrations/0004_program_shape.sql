-- SQLite treats NULL CHECK expressions as successful. Explicitly reject
-- incomplete custom-item variants while preserving nullable reference columns.
CREATE TRIGGER complete_custom_item_insert BEFORE INSERT ON program_items
 WHEN NEW.revision_id IS NULL AND (NEW.custom_name IS NULL OR length(trim(NEW.custom_name))=0 OR NEW.custom_type IS NULL OR length(trim(NEW.custom_type))=0 OR NEW.custom_duration IS NULL OR NEW.custom_duration<=0)
 BEGIN SELECT RAISE(ABORT,'invalid_program_item'); END;
CREATE TRIGGER complete_custom_item_update BEFORE UPDATE ON program_items
 WHEN NEW.revision_id IS NULL AND (NEW.custom_name IS NULL OR length(trim(NEW.custom_name))=0 OR NEW.custom_type IS NULL OR length(trim(NEW.custom_type))=0 OR NEW.custom_duration IS NULL OR NEW.custom_duration<=0)
 BEGIN SELECT RAISE(ABORT,'invalid_program_item'); END;
