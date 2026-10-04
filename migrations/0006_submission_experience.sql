-- Preserve old submitted revisions and stable speaker IDs.
ALTER TABLE submission_revisions ADD COLUMN type_other TEXT NOT NULL DEFAULT '';
ALTER TABLE submission_revisions ADD COLUMN category_other TEXT NOT NULL DEFAULT '';
ALTER TABLE contributors ADD COLUMN role_other TEXT NOT NULL DEFAULT '';
ALTER TABLE event_character_overrides ADD COLUMN color TEXT CHECK(color IS NULL OR (length(color)=7 AND substr(color,1,1)='#' AND substr(color,2) NOT GLOB '*[^0-9a-fA-F]*'));
UPDATE characters SET archived=1,version=version+1 WHERE kind='builtin' AND id NOT IN('builtin-cocoa','builtin-chino','builtin-rize','builtin-chiya','builtin-syaro','builtin-maya','builtin-megu','builtin-tippy');
-- Theme colors: official character identities; hex values are the site's editable defaults.
UPDATE characters SET color=CASE stable_key WHEN 'cocoa' THEN '#F28C9B' WHEN 'chino' THEN '#67B2E5' WHEN 'rize' THEN '#A580C5' WHEN 'chiya' THEN '#78B86C' WHEN 'syaro' THEN '#F3CB67' WHEN 'maya' THEN '#73CCD2' WHEN 'megu' THEN '#F2A5BB' WHEN 'tippy' THEN '#FFFFFF' ELSE color END,version=version+1 WHERE kind='builtin' AND archived=0;
CREATE TABLE uploads (
 id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES submissions(id),
 object_key TEXT NOT NULL UNIQUE, multipart_id TEXT NOT NULL, filename TEXT NOT NULL,
 size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 1000000000), content_type TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN('receiving','completing','complete','aborted')),
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX uploads_expiry ON uploads(state,expires_at);
CREATE TABLE upload_parts (
 upload_id TEXT NOT NULL REFERENCES uploads(id), part_number INTEGER NOT NULL CHECK(part_number BETWEEN 1 AND 96),
 size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 10485760), sha256 TEXT NOT NULL, etag TEXT,
 PRIMARY KEY(upload_id,part_number)
);
CREATE TABLE revision_uploads (
 revision_id TEXT PRIMARY KEY REFERENCES submission_revisions(id), upload_id TEXT NOT NULL REFERENCES uploads(id)
);
CREATE TRIGGER upload_revision_scope BEFORE INSERT ON revision_uploads WHEN NOT EXISTS(SELECT 1 FROM uploads u JOIN submission_revisions r ON r.submission_id=u.submission_id WHERE r.id=NEW.revision_id AND u.id=NEW.upload_id AND u.state='complete') BEGIN SELECT RAISE(ABORT,'upload_scope'); END;
CREATE TRIGGER frozen_upload_insert BEFORE INSERT ON revision_uploads WHEN (SELECT submitted_at FROM submission_revisions WHERE id=NEW.revision_id) IS NOT NULL BEGIN SELECT RAISE(ABORT,'revision_frozen'); END;
CREATE TRIGGER frozen_upload_update BEFORE UPDATE ON revision_uploads BEGIN SELECT RAISE(ABORT,'replace_upload_with_delete_insert'); END;
CREATE TRIGGER frozen_upload_delete BEFORE DELETE ON revision_uploads WHEN (SELECT submitted_at FROM submission_revisions WHERE id=OLD.revision_id) IS NOT NULL BEGIN SELECT RAISE(ABORT,'revision_frozen'); END;
-- Festival presets remain usable without falsely claiming live Bilibili UI verification.
ALTER TABLE bili_categories ADD COLUMN origin TEXT NOT NULL DEFAULT 'bilibili';
ALTER TABLE bili_role_options ADD COLUMN origin TEXT NOT NULL DEFAULT 'bilibili';
INSERT INTO bili_categories(id,name,enabled,origin) VALUES('preset-music','音乐',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-music-role-0','preset-music','策划',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-music-role-1','preset-music','演唱',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-music-role-2','preset-music','作词',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-music-role-3','preset-music','作曲',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-music-role-4','preset-music','编曲',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-music-role-5','preset-music','混音',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-music-role-6','preset-music','乐器演奏',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-music-role-7','preset-music','视频制作',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-music-role-8','preset-music','美术',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-music-role-9','preset-music','其他',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_categories(id,name,enabled,origin) VALUES('preset-dance','舞蹈',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-dance-role-0','preset-dance','策划',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-dance-role-1','preset-dance','舞者',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-dance-role-2','preset-dance','编舞',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-dance-role-3','preset-dance','摄影',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-dance-role-4','preset-dance','剪辑',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-dance-role-5','preset-dance','后期',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-dance-role-6','preset-dance','其他',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_categories(id,name,enabled,origin) VALUES('preset-animation','动画',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-animation-role-0','preset-animation','策划',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-animation-role-1','preset-animation','导演',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-animation-role-2','preset-animation','动画',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-animation-role-3','preset-animation','模型',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-animation-role-4','preset-animation','动作',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-animation-role-5','preset-animation','美术',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-animation-role-6','preset-animation','剪辑',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-animation-role-7','preset-animation','配音',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-animation-role-8','preset-animation','音效',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-animation-role-9','preset-animation','其他',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_categories(id,name,enabled,origin) VALUES('preset-film','影视',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-film-role-0','preset-film','策划',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-film-role-1','preset-film','导演',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-film-role-2','preset-film','编剧',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-film-role-3','preset-film','演员',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-film-role-4','preset-film','配音',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-film-role-5','preset-film','摄影',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-film-role-6','preset-film','剪辑',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-film-role-7','preset-film','后期',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-film-role-8','preset-film','音效',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-film-role-9','preset-film','其他',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_categories(id,name,enabled,origin) VALUES('preset-illustration','绘画',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-illustration-role-0','preset-illustration','策划',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-illustration-role-1','preset-illustration','绘画',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-illustration-role-2','preset-illustration','美术',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-illustration-role-3','preset-illustration','视频制作',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-illustration-role-4','preset-illustration','配音',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-illustration-role-5','preset-illustration','其他',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_categories(id,name,enabled,origin) VALUES('preset-other','其他',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-other-role-0','preset-other','策划',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-other-role-1','preset-other','制作',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-other-role-2','preset-other','演出',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-other-role-3','preset-other','剪辑',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-other-role-4','preset-other','后期',1,'https://usagi.mikanyan.com',1,'festival-default');
INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,enabled,origin) VALUES('preset-other-role-5','preset-other','其他',1,'https://usagi.mikanyan.com',1,'festival-default');
