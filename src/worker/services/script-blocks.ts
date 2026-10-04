import {sql} from './core';

// The program item reference owns an automatic chapter's name and placement.
// Keep titles out of sync writes so a program rename cannot overwrite dialogue.
export function automaticBlocks(db:D1Database,documentId:string){return [
 sql(db,"INSERT INTO script_blocks(id,document_id,title,at_start,opening,auto_generated,position,anchor_label) SELECT 'auto:'||lower(hex(randomblob(16))),d.id,'贺年祭开始',1,1,1,0,'贺年祭开始' FROM script_documents d WHERE d.id=? AND d.locked=0 AND NOT EXISTS(SELECT 1 FROM script_blocks b WHERE b.document_id=d.id AND b.at_start=1 AND b.auto_generated=1 AND b.deleted_at IS NULL)",documentId),
 sql(db,"INSERT INTO script_blocks(id,document_id,title,before_program_item_id,auto_generated,position) SELECT 'auto:'||lower(hex(randomblob(16))),d.id,'主持段落',pi.id,1,0 FROM script_documents d JOIN program_items pi ON pi.program_id=d.program_id WHERE d.id=? AND d.locked=0 AND NOT EXISTS(SELECT 1 FROM script_blocks b WHERE b.document_id=d.id AND b.before_program_item_id=pi.id AND b.auto_generated=1 AND b.deleted_at IS NULL)",documentId)
];}
