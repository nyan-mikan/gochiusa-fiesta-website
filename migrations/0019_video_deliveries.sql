-- Existing submitted revisions and attachments are deliberately unchanged.
CREATE TABLE upload_videos (
 upload_id TEXT PRIMARY KEY REFERENCES uploads(id) ON DELETE CASCADE,
 container TEXT NOT NULL CHECK(container IN ('mp4','quicktime','webm','matroska'))
);
CREATE TABLE revision_deliveries (
 revision_id TEXT PRIMARY KEY REFERENCES submission_revisions(id),
 upload_id TEXT NOT NULL REFERENCES upload_videos(upload_id),
 created_at TEXT NOT NULL
);
CREATE INDEX revision_deliveries_upload ON revision_deliveries(upload_id);
CREATE TRIGGER delivery_scope BEFORE INSERT ON revision_deliveries
WHEN NOT EXISTS (
 SELECT 1 FROM submission_revisions r JOIN submissions s ON s.id=r.submission_id
 JOIN uploads u ON u.submission_id=s.id JOIN upload_videos v ON v.upload_id=u.id
 WHERE r.id=NEW.revision_id AND u.id=NEW.upload_id AND u.state='complete'
 AND s.deleted_at IS NULL AND s.status IN ('pending','approved') AND r.submitted_at IS NOT NULL
 AND r.revision_no=(SELECT MAX(revision_no) FROM submission_revisions WHERE submission_id=s.id)
 AND NOT EXISTS(SELECT 1 FROM revision_uploads WHERE revision_id=r.id)
)
BEGIN SELECT (CASE WHEN 1 THEN RAISE(ABORT,'delivery_unavailable') END); END;
CREATE TRIGGER delivery_update_frozen BEFORE UPDATE ON revision_deliveries
BEGIN SELECT (CASE WHEN 1 THEN RAISE(ABORT,'revision_frozen') END); END;
CREATE TRIGGER delivery_delete_frozen BEFORE DELETE ON revision_deliveries
BEGIN SELECT (CASE WHEN 1 THEN RAISE(ABORT,'revision_frozen') END); END;
CREATE TRIGGER upload_video_update_frozen BEFORE UPDATE ON upload_videos
BEGIN SELECT (CASE WHEN 1 THEN RAISE(ABORT,'revision_frozen') END); END;
CREATE TRIGGER revision_upload_video BEFORE INSERT ON revision_uploads
WHEN NOT EXISTS(SELECT 1 FROM upload_videos WHERE upload_id=NEW.upload_id)
BEGIN SELECT (CASE WHEN 1 THEN RAISE(ABORT,'video_required') END); END;
