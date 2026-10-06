-- A review identifier belongs to one saved line version, including historical versions.
CREATE TABLE script_language_reviews (
 id TEXT PRIMARY KEY,
 line_id TEXT NOT NULL REFERENCES script_lines(id),
 line_version INTEGER NOT NULL CHECK(line_version>=1),
 kind TEXT NOT NULL CHECK(kind IN('dialogue','comment','heading')),
 text TEXT NOT NULL CHECK(length(text)<=5000),
 direction TEXT NOT NULL CHECK(length(direction)<=500),
 requested_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','done','unavailable')),
 started_at TEXT,
 completed_at TEXT,
 UNIQUE(line_id,line_version)
);
CREATE INDEX script_language_review_queue ON script_language_reviews(status,created_at);
CREATE INDEX script_language_review_budget ON script_language_reviews(started_at);
CREATE INDEX script_language_review_requester ON script_language_reviews(requested_by,created_at);
CREATE TABLE script_language_issues (
 review_id TEXT NOT NULL REFERENCES script_language_reviews(id),
 issue_no INTEGER NOT NULL CHECK(issue_no BETWEEN 1 AND 20),
 category TEXT NOT NULL CHECK(category IN('grammar','particle','typo','neologism','register','other')),
 excerpt TEXT NOT NULL CHECK(length(excerpt) BETWEEN 1 AND 500),
 problem TEXT NOT NULL CHECK(length(problem) BETWEEN 1 AND 500),
 suggestion TEXT NOT NULL CHECK(length(suggestion) BETWEEN 1 AND 500),
 PRIMARY KEY(review_id,issue_no)
);
CREATE TABLE script_language_ignores (
 review_id TEXT NOT NULL,
 issue_no INTEGER NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 PRIMARY KEY(review_id,issue_no,user_id),
 FOREIGN KEY(review_id,issue_no) REFERENCES script_language_issues(review_id,issue_no)
);
CREATE TRIGGER script_language_input_fixed BEFORE UPDATE OF id,line_id,line_version,kind,text,direction,requested_by,created_at ON script_language_reviews
BEGIN SELECT RAISE(ABORT,'review_input_fixed'); END;
CREATE TRIGGER script_language_result_fixed BEFORE UPDATE ON script_language_reviews WHEN OLD.status IN('done','unavailable')
BEGIN SELECT RAISE(ABORT,'review_result_fixed'); END;
CREATE TRIGGER script_language_issue_insert BEFORE INSERT ON script_language_issues
WHEN NOT EXISTS(SELECT 1 FROM script_language_reviews WHERE id=NEW.review_id AND status='running')
BEGIN SELECT RAISE(ABORT,'review_result_fixed'); END;
CREATE TRIGGER script_language_issue_update BEFORE UPDATE ON script_language_issues
BEGIN SELECT RAISE(ABORT,'review_result_fixed'); END;
CREATE TRIGGER script_language_issue_delete BEFORE DELETE ON script_language_issues
BEGIN SELECT RAISE(ABORT,'review_result_fixed'); END;
