ALTER TABLE script_blocks ADD COLUMN scene TEXT NOT NULL DEFAULT '' CHECK(length(scene)<=500);
CREATE TABLE script_paragraph_reviews (
 id TEXT PRIMARY KEY,
 block_id TEXT NOT NULL REFERENCES script_blocks(id),
 fingerprint TEXT NOT NULL,
 context_key TEXT NOT NULL,
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json) AND length(snapshot_json)<=1000000),
 requested_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','done','unavailable')),
 started_at TEXT, completed_at TEXT,
 UNIQUE(block_id,fingerprint)
);
CREATE INDEX script_paragraph_queue ON script_paragraph_reviews(status,created_at);
CREATE INDEX script_paragraph_requester ON script_paragraph_reviews(requested_by,created_at);
CREATE TABLE script_paragraph_inputs (
 review_id TEXT NOT NULL REFERENCES script_paragraph_reviews(id),
 line_id TEXT NOT NULL REFERENCES script_lines(id),
 line_version INTEGER NOT NULL CHECK(line_version>=1),
 line_no INTEGER NOT NULL CHECK(line_no>=1),
 PRIMARY KEY(review_id,line_id), UNIQUE(review_id,line_no)
);
CREATE TABLE script_paragraph_issues (
 review_id TEXT NOT NULL REFERENCES script_paragraph_reviews(id),
 issue_no INTEGER NOT NULL CHECK(issue_no BETWEEN 1 AND 20),
 category TEXT NOT NULL CHECK(category IN('logic','context','setting')),
 problem TEXT NOT NULL CHECK(length(problem) BETWEEN 1 AND 500),
 suggestion TEXT NOT NULL CHECK(length(suggestion) BETWEEN 1 AND 500),
 PRIMARY KEY(review_id,issue_no)
);
CREATE TABLE script_paragraph_targets (
 review_id TEXT NOT NULL, issue_no INTEGER NOT NULL,
 line_id TEXT NOT NULL, excerpt TEXT NOT NULL CHECK(length(excerpt) BETWEEN 1 AND 500),
 PRIMARY KEY(review_id,issue_no,line_id),
 FOREIGN KEY(review_id,issue_no) REFERENCES script_paragraph_issues(review_id,issue_no),
 FOREIGN KEY(review_id,line_id) REFERENCES script_paragraph_inputs(review_id,line_id)
);
CREATE TABLE script_paragraph_ignores (
 review_id TEXT NOT NULL, issue_no INTEGER NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 PRIMARY KEY(review_id,issue_no,user_id),
 FOREIGN KEY(review_id,issue_no) REFERENCES script_paragraph_issues(review_id,issue_no)
);
CREATE TRIGGER paragraph_input_fixed BEFORE UPDATE OF id,block_id,fingerprint,context_key,snapshot_json,requested_by,created_at ON script_paragraph_reviews
BEGIN SELECT RAISE(ABORT,'review_input_fixed'); END;
CREATE TRIGGER paragraph_result_fixed BEFORE UPDATE ON script_paragraph_reviews WHEN OLD.status IN('done','unavailable')
BEGIN SELECT RAISE(ABORT,'review_result_fixed'); END;
CREATE TRIGGER paragraph_inputs_update BEFORE UPDATE ON script_paragraph_inputs BEGIN SELECT RAISE(ABORT,'review_input_fixed'); END;
CREATE TRIGGER paragraph_inputs_delete BEFORE DELETE ON script_paragraph_inputs BEGIN SELECT RAISE(ABORT,'review_input_fixed'); END;
CREATE TRIGGER paragraph_inputs_insert BEFORE INSERT ON script_paragraph_inputs WHEN NOT EXISTS(SELECT 1 FROM script_paragraph_reviews WHERE id=NEW.review_id AND status='queued') BEGIN SELECT RAISE(ABORT,'review_input_fixed'); END;
CREATE TRIGGER paragraph_issue_insert BEFORE INSERT ON script_paragraph_issues WHEN NOT EXISTS(SELECT 1 FROM script_paragraph_reviews WHERE id=NEW.review_id AND status='running') BEGIN SELECT RAISE(ABORT,'review_result_fixed'); END;
CREATE TRIGGER paragraph_issue_update BEFORE UPDATE ON script_paragraph_issues BEGIN SELECT RAISE(ABORT,'review_result_fixed'); END;
CREATE TRIGGER paragraph_issue_delete BEFORE DELETE ON script_paragraph_issues BEGIN SELECT RAISE(ABORT,'review_result_fixed'); END;
CREATE TRIGGER paragraph_target_insert BEFORE INSERT ON script_paragraph_targets WHEN NOT EXISTS(SELECT 1 FROM script_paragraph_reviews WHERE id=NEW.review_id AND status='running') BEGIN SELECT RAISE(ABORT,'review_result_fixed'); END;
CREATE TRIGGER paragraph_target_update BEFORE UPDATE ON script_paragraph_targets BEGIN SELECT RAISE(ABORT,'review_result_fixed'); END;
CREATE TRIGGER paragraph_target_delete BEFORE DELETE ON script_paragraph_targets BEGIN SELECT RAISE(ABORT,'review_result_fixed'); END;
