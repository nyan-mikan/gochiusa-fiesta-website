import { z } from 'zod';
import type {ModuleId} from './modules';

export const uid = z.string().regex(/^[0-9]*[1-9][0-9]*$/, '请填写非零的十进制 UID');
const short = z.string().trim().max(100);
const person = z.object({ name: short, uid: z.string().max(40) }).strict();
export const submissionDraft = z.object({
 title: short, type: z.string().max(30), description: z.string().max(1000), duration_seconds: z.number().int().min(0).max(86400),
 type_other:z.string().trim().max(100).default(''), category_other:z.string().trim().max(100).default(''), upload_id:z.string().nullable().default(null), category_id: z.string().nullable(), delivery_url: z.string().max(2000), access_notes: z.string().max(500), notes: z.string().max(1000),
 contact: person, uploader: person,
 contributors: z.array(person.extend({ role_option_id: z.string().nullable(), work_detail: z.string().max(500),role_other:z.string().trim().max(100).default('') })).max(100),
}).strict();
export const completeSubmission = submissionDraft.superRefine((value, ctx) => {
 for (const key of ['title','type','description','category_id'] as const) if (!value[key]) ctx.addIssue({code:'custom',path:[key],message:'此项必填'});
 if (!programTypes.includes(value.type)) ctx.addIssue({code:'custom',path:['type'],message:'请选择节目类型'});
 if (value.duration_seconds<1) ctx.addIssue({code:'custom',path:['duration_seconds'],message:'请填写节目时长'});
 if(value.type==='其他'&&!value.type_other)ctx.addIssue({code:'custom',path:['type_other'],message:'请说明具体节目类型'});
 if(value.delivery_url)try { const url=new URL(value.delivery_url); if(url.username || url.password || url.protocol!=='https:') throw new Error(); } catch {ctx.addIssue({code:'custom',path:['delivery_url'],message:'链接格式无效'});}
 for(const key of ['contact','uploader'] as const) {
  if(!value[key].name || !uid.safeParse(value[key].uid).success) ctx.addIssue({code:'custom',path:[key],message:'名称与数字 UID 必填'});
 }
 if (!value.contributors.length) ctx.addIssue({code:'custom',path:['contributors'],message:'至少填写一位制作人员'});
 const seen=new Set<string>();
 value.contributors.forEach((p,i)=>{
  if(!p.name || !uid.safeParse(p.uid).success || !p.role_option_id)ctx.addIssue({code:'custom',path:['contributors',i],message:'名称、UID 和职务必填'});
  const canonical=p.uid.replace(/^0+/,''); if(seen.has(canonical))ctx.addIssue({code:'custom',path:['contributors',i,'uid'],message:'同一 UID 不能重复'}); seen.add(canonical);
 });
 const names=new Map<string,string>();
 for(const p of [value.contact,value.uploader,...value.contributors]){
  const id=p.uid.replace(/^0+/,''); if(names.has(id) && names.get(id)!==p.name)ctx.addIssue({code:'custom',path:['contributors'],message:'同一 UID 的名称需要一致'}); names.set(id,p.name);
 }
});
export const programTypes=['翻唱','原创曲','宅舞','MMD','MAD或AMV','手书','配音或剧场','其他'];
export type SubmissionDraft = z.infer<typeof submissionDraft>;
export interface User {id:string;email:string;nickname:string;role:'submitter'|'admin';is_super_admin:boolean;modules:ModuleId[]}
export interface ManagedUser extends User {version:number;verified_at:string|null;created_at:string}
export interface Event {id:string;name:string;year:number;timezone:string;opens_at:string|null;closes_at:string|null;submissions_open:number;wishes_open:number;active:number;version:number}
export interface RoleOption {id:string;category_id:string;label:string;dictionary_version:number;verified_at:string|null;enabled:number;evidence_url:string}
export interface Category {version:number;origin?:string;id:string;name:string;platform_id:string|null;enabled:number;verified_at:string|null;staff_limit:number|null}
export interface FormConfig {uploads_enabled:boolean;events:Event[];categories:Category[];roles:RoleOption[];test_dictionary:boolean}
export interface Submission {id:string;event_id:string;owner_user_id:string;public_number:string;status:'draft'|'pending'|'approved'|'rejected';version:number;created_at:string;updated_at:string}
export interface Revision {id:string;submission_id:string;revision_no:number;title:string;type:string;description:string;duration_seconds:number;category_id:string|null;feedback_email:string;delivery_url:string;access_notes:string;notes:string;submitted_at:string|null;created_at:string}
export interface Review {id:string;revision_id:string;action:string;reason:string;internal_note?:string;created_at:string;reviewer_id?:string}
export interface UploadedFile {id:string;filename:string;size:number;content_type:string;state:string}
export interface Detail {category_name?:string|null;staff_limit?:number|null;staff_limit_verified?:boolean;warnings?:string[];submission:Submission;revision:Revision;form:SubmissionDraft;uploaded_file?:UploadedFile|null;reviews:Review[];revisions:Revision[];role_labels:Record<string,string>;notifications?:{id:string;status:string;attempts:number;last_error:string|null}[]}
export interface Program {id:string;event_id:string;version:number;change_seq:number;starts_at:string|null;locked:number}
export interface ProgramItem {id:string;program_id?:string;position:number;revision_id:string|null;custom_name:string|null;custom_type:string|null;custom_duration:number|null;notes:string;title?:string;type?:string;duration_seconds?:number}
export interface ScriptDocument {id:string;program_id:string;structure_version:number;locked:number;finalized_program_version:number|null;finalized_seq:number|null}
export interface Block {id:string;document_id:string;title:string;scene?:string;before_program_item_id:string|null;at_end:number;at_start?:number;auto_generated?:number;opening:number;anchor_label:string;position:number;estimated_seconds:number;version:number;deleted_at:string|null}
export type LineKind='dialogue'|'comment'|'heading';
export interface DialogueSegment {text:string;speaker_ids:string[]}
export interface Line {id:string;block_id:string;kind?:LineKind;speaker_id:string|null;segments?:DialogueSegment[];text:string;direction:string;position:number;version:number;updated_by:string;updated_at:string;deleted_at:string|null}
export const lineKind=(line:Pick<Line,'kind'|'speaker_id'>):LineKind=>line.speaker_id==='aux-narrator'?'comment':line.kind??'dialogue';
export interface Character {id:string;stable_key:string;event_id:string|null;kind:string;name:string;japanese_name:string;color:string;archived:number;version:number;override_version?:number;display_name?:string;hidden?:number;favorite?:number;aliases?:string[];sources?:{url:string;verification:string}[]}
export interface CharacterList {id:string;event_id:string;name:string;position:number;archived:number;version:number;members:string[]}
export interface Snapshot {program:Program;items:ProgramItem[];document:ScriptDocument;blocks:Block[];lines:Line[];characters:Character[];lists:CharacterList[];seq:number}
export interface Change {seq:number;type:string;payload:string;operation_id:string}

const id=z.string().min(1).max(100), ver=z.number().int().min(1), pos=z.number().int().min(0);
const operationBase={operation_id:id};
const entryKind=z.enum(['dialogue','comment','heading']).optional();
const segments=z.array(z.object({text:z.string().max(5000),speaker_ids:z.array(id).max(20).refine(ids=>new Set(ids).size===ids.length,'同一片段的角色不能重复')}).strict()).min(1).max(50).refine(parts=>parts.reduce((sum,p)=>sum+p.text.length,0)<=5000,'整条台词最多 5000 字').nullable().optional();
export const scriptOperation=z.discriminatedUnion('type',[
 z.object({...operationBase,type:z.literal('line.add'),block_id:id,id,expectedVersion:ver,after_id:id.optional(),kind:entryKind,speaker_id:id.nullable(),segments,text:z.string().max(5000),direction:z.string().max(500)}).strict(),
 z.object({...operationBase,type:z.literal('line.update'),id,expectedVersion:ver,kind:entryKind,speaker_id:id.nullable(),segments,text:z.string().max(5000),direction:z.string().max(500)}).strict(),
 z.object({...operationBase,type:z.literal('line.split'),id,expectedVersion:ver,blockVersion:ver,new_id:id,offset:z.number().int().min(1)}).strict(),
 z.object({...operationBase,type:z.literal('line.merge'),id,expectedVersion:ver,blockVersion:ver,next_id:id,nextVersion:ver}).strict(),
 z.object({...operationBase,type:z.literal('line.delete-many'),items:z.array(z.object({id,expectedVersion:ver,blockVersion:ver}).strict()).min(1).max(100).refine(items=>new Set(items.map(x=>x.id)).size===items.length,'不能重复选择台词')}).strict(),
 z.object({...operationBase,type:z.literal('line.delete'),id,expectedVersion:ver,blockVersion:ver}).strict(),
 z.object({...operationBase,type:z.literal('line.reorder'),block_id:id,expectedVersion:ver,ids:z.array(id).max(500)}).strict(),
 z.object({...operationBase,type:z.literal('block.add'),id,expectedVersion:ver,title:short,before_program_item_id:id.nullable(),at_end:z.boolean(),at_start:z.boolean().optional(),opening:z.boolean()}).strict(),
 z.object({...operationBase,type:z.literal('block.update'),id,expectedVersion:ver,title:short,scene:z.string().max(500).optional(),before_program_item_id:id.nullable(),at_end:z.boolean(),at_start:z.boolean().optional(),position:pos,estimated_seconds:pos,opening:z.boolean()}).strict(),
 z.object({...operationBase,type:z.literal('block.delete'),id,expectedVersion:ver,documentVersion:ver}).strict(),
 z.object({...operationBase,type:z.literal('script.lock'),expectedVersion:ver,expectedSeq:pos,programVersion:ver,locked:z.boolean(),reason:z.string().max(1000)}).strict(),
]);
export type ScriptOperation=z.infer<typeof scriptOperation>;
export const programInput=z.object({operation_id:id,expectedVersion:ver,starts_at:z.string().datetime().nullable(),items:z.array(z.object({id,revision_id:id.nullable(),custom_name:short.nullable(),custom_type:short.nullable(),custom_duration:z.number().int().min(1).max(86400).nullable(),notes:z.string().max(1000)}).strict()).max(500)}).strict();
export type ProgramInput=z.infer<typeof programInput>;
export const characterOperation=z.discriminatedUnion('type',[
 z.object({...operationBase,type:z.literal('character.add'),id,name:short.min(1),color:z.string().regex(/^#[0-9a-fA-F]{6}$/),list_id:id.nullable()}).strict(),
 z.object({...operationBase,type:z.literal('character.update'),id,expectedVersion:ver,name:short.min(1),color:z.string().regex(/^#[0-9a-fA-F]{6}$/),archived:z.boolean()}).strict(),
 z.object({...operationBase,type:z.literal('character.override'),id,expectedVersion:pos,display_name:short.nullable(),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),hidden:z.boolean(),favorite:z.boolean()}).strict(),
 z.object({...operationBase,type:z.literal('list.add'),id,name:short.min(1)}).strict(),
 z.object({...operationBase,type:z.literal('list.update'),id,expectedVersion:ver,name:short.min(1),archived:z.boolean(),members:z.array(id).max(300),position:pos}).strict(),
]);
export type CharacterOperation=z.infer<typeof characterOperation>;
