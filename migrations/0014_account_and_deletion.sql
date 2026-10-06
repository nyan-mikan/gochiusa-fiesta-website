ALTER TABLE users ADD COLUMN nickname TEXT NOT NULL DEFAULT '' CHECK(length(nickname)<=40);
ALTER TABLE submissions ADD COLUMN deleted_at TEXT;
ALTER TABLE login_key_challenges ADD COLUMN purpose TEXT NOT NULL DEFAULT 'login' CHECK(purpose IN('login','identify'));
-- Preserve historical wishes; prevent every future duplicate, including concurrent inserts.
CREATE TRIGGER wish_single_entry BEFORE INSERT ON wishes
WHEN EXISTS(SELECT 1 FROM wishes WHERE event_id=NEW.event_id AND owner_user_id=NEW.owner_user_id)
BEGIN SELECT RAISE(ABORT,'wish_limit'); END;
CREATE TRIGGER wish_single_submit BEFORE UPDATE OF status ON wishes
WHEN NEW.status='submitted' AND EXISTS(SELECT 1 FROM wishes WHERE event_id=NEW.event_id AND owner_user_id=NEW.owner_user_id AND id<>NEW.id AND status='submitted')
BEGIN SELECT RAISE(ABORT,'wish_limit'); END;
CREATE TRIGGER wish_identity_fixed BEFORE UPDATE OF event_id,owner_user_id ON wishes
WHEN NEW.event_id<>OLD.event_id OR NEW.owner_user_id<>OLD.owner_user_id
BEGIN SELECT RAISE(ABORT,'wish_identity_fixed'); END;
CREATE TRIGGER submission_delete_guard BEFORE UPDATE OF deleted_at ON submissions
WHEN NEW.deleted_at IS NOT NULL AND (OLD.status<>'draft' OR EXISTS(SELECT 1 FROM submission_revisions WHERE submission_id=OLD.id AND submitted_at IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'draft_delete_forbidden'); END;
CREATE TRIGGER deleted_submission_fixed BEFORE UPDATE ON submissions WHEN OLD.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'draft_deleted'); END;
CREATE TRIGGER deleted_submission_upload BEFORE INSERT ON uploads
WHEN EXISTS(SELECT 1 FROM submissions WHERE id=NEW.submission_id AND deleted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'draft_deleted'); END;
