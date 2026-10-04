PRAGMA foreign_keys = ON;

CREATE TABLE users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 role TEXT NOT NULL DEFAULT 'submitter' CHECK(role IN ('submitter','admin')),
 verified_at TEXT, disabled_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE auth_challenges (
 id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE, code_hash TEXT NOT NULL,
 expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 used_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX auth_email_time ON auth_challenges(email,created_at);
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 expires_at TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE rate_limits (scope TEXT NOT NULL, bucket INTEGER NOT NULL, count INTEGER NOT NULL CHECK(count>0), PRIMARY KEY(scope,bucket));
CREATE TABLE events (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, year INTEGER NOT NULL CHECK(year BETWEEN 2000 AND 2200),
 timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai', opens_at TEXT, closes_at TEXT,
 submissions_open INTEGER NOT NULL DEFAULT 0 CHECK(submissions_open IN(0,1)),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)), version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE bili_categories (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, platform_id TEXT, enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 verified_at TEXT, staff_limit INTEGER CHECK(staff_limit>0)
);
-- Each immutable option is the historical definition of a role in one category/version.
CREATE TABLE bili_role_options (
 id TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES bili_categories(id), label TEXT NOT NULL,
 dictionary_version INTEGER NOT NULL CHECK(dictionary_version>0), evidence_url TEXT NOT NULL,
 verified_at TEXT, enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 UNIQUE(category_id,label,dictionary_version), UNIQUE(id,category_id)
);
CREATE TRIGGER immutable_role_definition BEFORE UPDATE OF category_id,label,dictionary_version,evidence_url ON bili_role_options
 BEGIN SELECT RAISE(ABORT,'immutable_dictionary'); END;
CREATE TABLE submissions (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), owner_user_id TEXT NOT NULL REFERENCES users(id),
 public_number TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','pending','approved','rejected')),
 version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(id,event_id)
);
CREATE INDEX submissions_event_status ON submissions(event_id,status,updated_at);
CREATE INDEX submissions_owner ON submissions(owner_user_id);
CREATE TABLE submission_revisions (
 id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES submissions(id), revision_no INTEGER NOT NULL,
 title TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
 duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK(duration_seconds>=0), category_id TEXT REFERENCES bili_categories(id),
 feedback_email TEXT NOT NULL, delivery_url TEXT NOT NULL DEFAULT '', access_notes TEXT NOT NULL DEFAULT '',
 notes TEXT NOT NULL DEFAULT '', submitted_at TEXT, created_at TEXT NOT NULL,
 UNIQUE(submission_id,revision_no), UNIQUE(id,submission_id)
);
-- A person's Bilibili identity is a version-specific fact; names are not a global UID directory.
CREATE TABLE revision_people (
 id TEXT PRIMARY KEY, revision_id TEXT NOT NULL REFERENCES submission_revisions(id),
 uid TEXT CHECK(uid IS NULL OR (length(uid)>0 AND uid NOT GLOB '*[^0-9]*' AND uid GLOB '*[1-9]*')), name TEXT NOT NULL,
 UNIQUE(revision_id,uid), UNIQUE(id,revision_id)
);
CREATE TABLE revision_contacts (
 revision_id TEXT PRIMARY KEY REFERENCES submission_revisions(id), contact_person_id TEXT NOT NULL, uploader_person_id TEXT NOT NULL,
 FOREIGN KEY(contact_person_id,revision_id) REFERENCES revision_people(id,revision_id),
 FOREIGN KEY(uploader_person_id,revision_id) REFERENCES revision_people(id,revision_id)
);
CREATE TABLE contributors (
 revision_id TEXT NOT NULL REFERENCES submission_revisions(id), person_id TEXT NOT NULL,
 role_option_id TEXT REFERENCES bili_role_options(id), work_detail TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL CHECK(position>=0),
 PRIMARY KEY(revision_id,person_id), UNIQUE(revision_id,position),
 FOREIGN KEY(person_id,revision_id) REFERENCES revision_people(id,revision_id)
);
CREATE TABLE reviews (
 id TEXT PRIMARY KEY, revision_id TEXT NOT NULL REFERENCES submission_revisions(id), reviewer_id TEXT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL CHECK(action IN('approved','rejected','reopen')), reason TEXT NOT NULL DEFAULT '',
 internal_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
 CHECK(action='approved' OR length(trim(reason))>0)
);
CREATE UNIQUE INDEX one_final_review ON reviews(revision_id) WHERE action IN('approved','rejected');
CREATE INDEX reviews_revision ON reviews(revision_id,created_at);
CREATE TABLE programs (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL UNIQUE REFERENCES events(id), version INTEGER NOT NULL DEFAULT 1,
 change_seq INTEGER NOT NULL DEFAULT 0, starts_at TEXT, locked INTEGER NOT NULL DEFAULT 0 CHECK(locked IN(0,1))
);
CREATE TABLE program_items (
 id TEXT PRIMARY KEY, program_id TEXT NOT NULL REFERENCES programs(id), position INTEGER NOT NULL CHECK(position>=0),
 revision_id TEXT REFERENCES submission_revisions(id), custom_name TEXT, custom_type TEXT,
 custom_duration INTEGER CHECK(custom_duration>0), notes TEXT NOT NULL DEFAULT '',
 CHECK((revision_id IS NOT NULL AND custom_name IS NULL AND custom_duration IS NULL AND custom_type IS NULL)
 OR (revision_id IS NULL AND length(trim(custom_name))>0 AND custom_duration>0 AND length(trim(custom_type))>0)),
 UNIQUE(program_id,revision_id), UNIQUE(id,program_id)
);
CREATE INDEX program_item_order ON program_items(program_id,position);
CREATE TABLE program_history (
 id TEXT PRIMARY KEY, program_id TEXT NOT NULL REFERENCES programs(id), version INTEGER NOT NULL,
 actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', snapshot TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE script_documents (
 id TEXT PRIMARY KEY, program_id TEXT NOT NULL UNIQUE REFERENCES programs(id), structure_version INTEGER NOT NULL DEFAULT 1,
 locked INTEGER NOT NULL DEFAULT 0 CHECK(locked IN(0,1)), finalized_program_version INTEGER, finalized_seq INTEGER
);
CREATE TABLE script_blocks (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES script_documents(id), title TEXT NOT NULL,
 before_program_item_id TEXT REFERENCES program_items(id) ON DELETE SET NULL,
 at_end INTEGER NOT NULL DEFAULT 0 CHECK(at_end IN(0,1)), opening INTEGER NOT NULL DEFAULT 0 CHECK(opening IN(0,1)),
 anchor_label TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0 CHECK(position>=0),
 estimated_seconds INTEGER NOT NULL DEFAULT 0 CHECK(estimated_seconds>=0), version INTEGER NOT NULL DEFAULT 1,
 deleted_at TEXT, CHECK(at_end=0 OR before_program_item_id IS NULL)
);
CREATE TABLE characters (
 id TEXT PRIMARY KEY, stable_key TEXT NOT NULL UNIQUE, event_id TEXT REFERENCES events(id),
 kind TEXT NOT NULL CHECK(kind IN('builtin','custom','auxiliary')), name TEXT NOT NULL, japanese_name TEXT NOT NULL DEFAULT '',
 color TEXT NOT NULL DEFAULT '#79694f', archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN(0,1)),
 version INTEGER NOT NULL DEFAULT 1, CHECK((kind='custom' AND event_id IS NOT NULL) OR (kind<>'custom' AND event_id IS NULL))
);
CREATE TABLE character_aliases (character_id TEXT NOT NULL REFERENCES characters(id), alias TEXT NOT NULL, PRIMARY KEY(character_id,alias));
CREATE TABLE character_sources (character_id TEXT NOT NULL REFERENCES characters(id), url TEXT NOT NULL, checked_at TEXT NOT NULL, verification TEXT NOT NULL, PRIMARY KEY(character_id,url));
CREATE TABLE character_lists (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0,
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN(0,1)), version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE character_list_members (
 list_id TEXT NOT NULL REFERENCES character_lists(id), character_id TEXT NOT NULL REFERENCES characters(id), position INTEGER NOT NULL,
 PRIMARY KEY(list_id,character_id)
);
CREATE TABLE event_character_overrides (
 event_id TEXT NOT NULL REFERENCES events(id), character_id TEXT NOT NULL REFERENCES characters(id),
 display_name TEXT, hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN(0,1)), favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN(0,1)), version INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(event_id,character_id)
);
CREATE TABLE script_lines (
 id TEXT PRIMARY KEY, block_id TEXT NOT NULL REFERENCES script_blocks(id), speaker_id TEXT REFERENCES characters(id),
 text TEXT NOT NULL DEFAULT '', direction TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL CHECK(position>=0),
 version INTEGER NOT NULL DEFAULT 1, updated_by TEXT NOT NULL REFERENCES users(id), updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX script_lines_order ON script_lines(block_id,position);
CREATE INDEX script_lines_speaker ON script_lines(speaker_id);
CREATE TABLE script_history (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES script_documents(id), entity_id TEXT NOT NULL,
 action TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id), before_json TEXT, after_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE operation_results (
 actor_id TEXT NOT NULL REFERENCES users(id), scope TEXT NOT NULL, operation_id TEXT NOT NULL,
 request_hash TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(actor_id,scope,operation_id)
);
CREATE TABLE program_changes (
 program_id TEXT NOT NULL REFERENCES programs(id), seq INTEGER NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id),
 operation_id TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(program_id,seq)
);
CREATE TABLE export_snapshots (
 id TEXT PRIMARY KEY, program_id TEXT NOT NULL REFERENCES programs(id), program_version INTEGER NOT NULL,
 script_seq INTEGER NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id), content_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE email_outbox (
 id TEXT PRIMARY KEY, event_key TEXT NOT NULL UNIQUE, submission_id TEXT REFERENCES submissions(id),
 recipient TEXT NOT NULL, subject TEXT NOT NULL, text TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN('queued','sending','sent','failed','delivered','bounced')),
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL, lease_token TEXT, lease_until TEXT,
 provider_id TEXT, last_error TEXT, created_at TEXT NOT NULL
);
CREATE INDEX outbox_due ON email_outbox(status,next_attempt_at);
CREATE TABLE audit_logs (
 id TEXT PRIMARY KEY, actor_id TEXT REFERENCES users(id), object_type TEXT NOT NULL, object_id TEXT NOT NULL,
 action TEXT NOT NULL, summary TEXT NOT NULL, created_at TEXT NOT NULL
);
-- Transient assertion rows turn a failed optimistic condition into a batch rollback.
CREATE TABLE transaction_assertions (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1));

CREATE TRIGGER protect_approved_reopen BEFORE UPDATE OF status ON submissions
 WHEN OLD.status='approved' AND NEW.status<>'approved' AND EXISTS(
 SELECT 1 FROM program_items pi JOIN submission_revisions r ON r.id=pi.revision_id WHERE r.submission_id=OLD.id)
 BEGIN SELECT RAISE(ABORT,'program_reference_exists'); END;

CREATE TRIGGER program_item_insert BEFORE INSERT ON program_items BEGIN
 SELECT (CASE WHEN (SELECT locked FROM programs WHERE id=NEW.program_id)=1 THEN RAISE(ABORT,'program_locked') END);
 SELECT (CASE WHEN NEW.revision_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM submission_revisions r JOIN submissions s ON s.id=r.submission_id JOIN programs p ON p.id=NEW.program_id
 WHERE r.id=NEW.revision_id AND s.event_id=p.event_id AND s.status='approved' AND r.submitted_at IS NOT NULL
 AND r.revision_no=(SELECT MAX(revision_no) FROM submission_revisions WHERE submission_id=s.id)) THEN RAISE(ABORT,'invalid_program_revision') END);
END;
CREATE TRIGGER program_item_update BEFORE UPDATE ON program_items BEGIN
 SELECT (CASE WHEN (SELECT locked FROM programs WHERE id=OLD.program_id)=1 THEN RAISE(ABORT,'program_locked') END);
 SELECT (CASE WHEN NEW.program_id<>OLD.program_id OR NEW.revision_id IS NOT OLD.revision_id THEN RAISE(ABORT,'immutable_program_reference') END);
END;
CREATE TRIGGER program_item_delete BEFORE DELETE ON program_items
 WHEN (SELECT locked FROM programs WHERE id=OLD.program_id)=1 BEGIN SELECT RAISE(ABORT,'program_locked'); END;
CREATE TRIGGER script_anchor_insert BEFORE INSERT ON script_blocks
 WHEN NEW.before_program_item_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM program_items pi JOIN script_documents d ON d.program_id=pi.program_id WHERE pi.id=NEW.before_program_item_id AND d.id=NEW.document_id)
 BEGIN SELECT RAISE(ABORT,'invalid_anchor'); END;
CREATE TRIGGER script_anchor_update BEFORE UPDATE OF before_program_item_id ON script_blocks
 WHEN NEW.before_program_item_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM program_items pi JOIN script_documents d ON d.program_id=pi.program_id WHERE pi.id=NEW.before_program_item_id AND d.id=NEW.document_id)
 BEGIN SELECT RAISE(ABORT,'invalid_anchor'); END;
CREATE TRIGGER list_scope_insert BEFORE INSERT ON character_list_members
 WHEN EXISTS(SELECT 1 FROM characters c JOIN character_lists l ON l.id=NEW.list_id WHERE c.id=NEW.character_id AND c.event_id IS NOT NULL AND c.event_id<>l.event_id)
 BEGIN SELECT RAISE(ABORT,'character_scope'); END;
CREATE TRIGGER no_builtin_edit BEFORE UPDATE OF name,japanese_name,stable_key,event_id,kind ON characters WHEN OLD.kind<>'custom'
 BEGIN SELECT RAISE(ABORT,'builtin_identity'); END;
CREATE TRIGGER no_character_delete BEFORE DELETE ON characters
 BEGIN SELECT RAISE(ABORT,'archive_character_instead'); END;

CREATE TRIGGER frozen_submission_revisions_update BEFORE UPDATE ON submission_revisions WHEN (SELECT submitted_at FROM submission_revisions WHERE id=OLD.id) IS NOT NULL BEGIN SELECT RAISE(ABORT,'revision_frozen'); END;

CREATE TRIGGER frozen_submission_revisions_delete BEFORE DELETE ON submission_revisions WHEN (SELECT submitted_at FROM submission_revisions WHERE id=OLD.id) IS NOT NULL BEGIN SELECT RAISE(ABORT,'revision_frozen'); END;

CREATE TRIGGER frozen_revision_people_update BEFORE UPDATE ON revision_people WHEN (SELECT submitted_at FROM submission_revisions WHERE id=OLD.revision_id) IS NOT NULL BEGIN SELECT RAISE(ABORT,'revision_frozen'); END;

CREATE TRIGGER frozen_revision_people_delete BEFORE DELETE ON revision_people WHEN (SELECT submitted_at FROM submission_revisions WHERE id=OLD.revision_id) IS NOT NULL BEGIN SELECT RAISE(ABORT,'revision_frozen'); END;

CREATE TRIGGER frozen_revision_contacts_update BEFORE UPDATE ON revision_contacts WHEN (SELECT submitted_at FROM submission_revisions WHERE id=OLD.revision_id) IS NOT NULL BEGIN SELECT RAISE(ABORT,'revision_frozen'); END;

CREATE TRIGGER frozen_revision_contacts_delete BEFORE DELETE ON revision_contacts WHEN (SELECT submitted_at FROM submission_revisions WHERE id=OLD.revision_id) IS NOT NULL BEGIN SELECT RAISE(ABORT,'revision_frozen'); END;

CREATE TRIGGER frozen_contributors_update BEFORE UPDATE ON contributors WHEN (SELECT submitted_at FROM submission_revisions WHERE id=OLD.revision_id) IS NOT NULL BEGIN SELECT RAISE(ABORT,'revision_frozen'); END;

CREATE TRIGGER frozen_contributors_delete BEFORE DELETE ON contributors WHEN (SELECT submitted_at FROM submission_revisions WHERE id=OLD.revision_id) IS NOT NULL BEGIN SELECT RAISE(ABORT,'revision_frozen'); END;

CREATE TRIGGER frozen_revision_people_insert BEFORE INSERT ON revision_people WHEN (SELECT submitted_at FROM submission_revisions WHERE id=NEW.revision_id) IS NOT NULL BEGIN SELECT RAISE(ABORT,'revision_frozen'); END;

CREATE TRIGGER frozen_revision_contacts_insert BEFORE INSERT ON revision_contacts WHEN (SELECT submitted_at FROM submission_revisions WHERE id=NEW.revision_id) IS NOT NULL BEGIN SELECT RAISE(ABORT,'revision_frozen'); END;

CREATE TRIGGER frozen_contributors_insert BEFORE INSERT ON contributors WHEN (SELECT submitted_at FROM submission_revisions WHERE id=NEW.revision_id) IS NOT NULL BEGIN SELECT RAISE(ABORT,'revision_frozen'); END;

CREATE TRIGGER contributor_category_insert BEFORE INSERT ON contributors WHEN NEW.role_option_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM bili_role_options o JOIN submission_revisions r ON r.category_id=o.category_id WHERE o.id=NEW.role_option_id AND r.id=NEW.revision_id) BEGIN SELECT RAISE(ABORT,'role_category_mismatch'); END;

CREATE TRIGGER contributor_category_update BEFORE UPDATE ON contributors WHEN NEW.role_option_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM bili_role_options o JOIN submission_revisions r ON r.category_id=o.category_id WHERE o.id=NEW.role_option_id AND r.id=NEW.revision_id) BEGIN SELECT RAISE(ABORT,'role_category_mismatch'); END;

CREATE TRIGGER locked_script_blocks_insert BEFORE INSERT ON script_blocks WHEN (SELECT locked FROM script_documents WHERE id=NEW.document_id)=1 BEGIN SELECT RAISE(ABORT,'script_locked'); END;

CREATE TRIGGER locked_script_blocks_update BEFORE UPDATE ON script_blocks WHEN (SELECT locked FROM script_documents WHERE id=NEW.document_id)=1 BEGIN SELECT RAISE(ABORT,'script_locked'); END;

CREATE TRIGGER locked_script_blocks_delete BEFORE DELETE ON script_blocks WHEN (SELECT locked FROM script_documents WHERE id=OLD.document_id)=1 BEGIN SELECT RAISE(ABORT,'script_locked'); END;

CREATE TRIGGER locked_script_lines_insert BEFORE INSERT ON script_lines WHEN (SELECT locked FROM script_documents WHERE id=(SELECT document_id FROM script_blocks WHERE id=NEW.block_id))=1 BEGIN SELECT RAISE(ABORT,'script_locked'); END;

CREATE TRIGGER locked_script_lines_update BEFORE UPDATE ON script_lines WHEN (SELECT locked FROM script_documents WHERE id=(SELECT document_id FROM script_blocks WHERE id=NEW.block_id))=1 BEGIN SELECT RAISE(ABORT,'script_locked'); END;

CREATE TRIGGER locked_script_lines_delete BEFORE DELETE ON script_lines WHEN (SELECT locked FROM script_documents WHERE id=(SELECT document_id FROM script_blocks WHERE id=OLD.block_id))=1 BEGIN SELECT RAISE(ABORT,'script_locked'); END;

CREATE TRIGGER speaker_scope_insert BEFORE INSERT ON script_lines WHEN NEW.speaker_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM characters c, script_blocks b JOIN script_documents d ON d.id=b.document_id JOIN programs p ON p.id=d.program_id WHERE c.id=NEW.speaker_id AND b.id=NEW.block_id AND (c.event_id IS NULL OR c.event_id=p.event_id)) BEGIN SELECT RAISE(ABORT,'character_scope'); END;

CREATE TRIGGER speaker_scope_update BEFORE UPDATE ON script_lines WHEN NEW.speaker_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM characters c, script_blocks b JOIN script_documents d ON d.id=b.document_id JOIN programs p ON p.id=d.program_id WHERE c.id=NEW.speaker_id AND b.id=NEW.block_id AND (c.event_id IS NULL OR c.event_id=p.event_id)) BEGIN SELECT RAISE(ABORT,'character_scope'); END;
