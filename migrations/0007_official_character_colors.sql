-- Exact official character-theme colors from gochiusa.com/core_sys/css/usa/usa_039.css.
-- These are editable event support-color defaults, not a claim of a formal penlight standard.
UPDATE characters SET color=CASE stable_key
 WHEN 'cocoa' THEN '#FDD5D5' WHEN 'chino' THEN '#CAD8F5' WHEN 'rize' THEN '#E6AEE6'
 WHEN 'chiya' THEN '#CFEA89' WHEN 'syaro' THEN '#F5D292' WHEN 'maya' THEN '#A0ECD9'
 WHEN 'megu' THEN '#F1BCA5' WHEN 'tippy' THEN '#A7BAD8' ELSE color END,version=version+1
 WHERE kind='builtin' AND archived=0;
INSERT INTO character_sources(character_id,url,checked_at,verification)
 SELECT id,'https://gochiusa.com/core_sys/css/usa/usa_039.css','2026-10-02','official-theme-color'
 FROM characters WHERE kind='builtin' AND archived=0;
