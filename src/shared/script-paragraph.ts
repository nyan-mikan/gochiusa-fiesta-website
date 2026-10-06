import type {Block,Line,ProgramItem} from './models';
import type {LanguageIssue} from './script-language';

export interface ParagraphIssue extends Omit<LanguageIssue,'excerpt'> {targets:{line_id:string;excerpt:string}[]}
export interface ParagraphReview {id:string;block_id:string;context_key:string;state:'pending'|'complete'|'unavailable';issues:ParagraphIssue[]}
export const paragraphLines=(block:Block,lines:Line[])=>lines.filter(l=>l.block_id===block.id&&!l.deleted_at).sort((a,b)=>a.position-b.position||(a.id<b.id?-1:a.id>b.id?1:0));
// Both sides compare saved context; unrelated document edits do not invalidate a paragraph.
export function paragraphKey(block:Block,lines:Line[],item?:ProgramItem){return JSON.stringify([block.id,block.version,block.title,block.scene??'',block.position,block.at_start??0,block.at_end,block.opening,block.before_program_item_id,block.anchor_label,item?[item.title??'',item.type??'',item.notes]:null,paragraphLines(block,lines).map(l=>[l.id,l.version,l.position])]);}
