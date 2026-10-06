import { z } from 'zod';
import {canAccess} from '../../shared/modules';
import {moduleGuard,requireModule} from './module-access';
import { completeSubmission, submissionDraft, type SubmissionDraft, type Submission, type Revision, type User, type Detail, type Review, type Event, type RoleOption, type Category } from '../../shared/models';
import { all, AppError, atomic, audit, cleanup, first, guard, id, now, operationResult, parse, previous, sql } from './core';
import { outbox } from './mail';

export async function formConfig(env:Env){
 const test=env.ENVIRONMENT==='development';return {
 events:await all<Event>(env.DB,'SELECT * FROM events WHERE active=1 ORDER BY year DESC'),
 categories:await all<Category>(env.DB,'SELECT * FROM bili_categories WHERE enabled=1 '+(test?'':"AND (verified_at IS NOT NULL OR origin='festival-default')")),
 roles:await all<RoleOption>(env.DB,'SELECT * FROM bili_role_options WHERE enabled=1 '+(test?'':"AND (verified_at IS NOT NULL OR origin='festival-default')")),
 test_dictionary:test,uploads_enabled:!!env.UPLOADS};
}
export async function detail(env:Env,user:User,submissionId:string,revisionId?:string):Promise<Detail>{
 const s=await first<Submission>(env.DB,'SELECT * FROM submissions WHERE id=? AND deleted_at IS NULL',submissionId);
 if(!s || (s.owner_user_id!==user.id && !canAccess(user,'review')))throw new AppError(404,'投稿不存在');
 const revisions=await all<Revision>(env.DB,'SELECT * FROM submission_revisions WHERE submission_id=? ORDER BY revision_no DESC',s.id);
 const r=revisionId?revisions.find(x=>x.id===revisionId):revisions[0];if(!r)throw new AppError(404,'投稿版本不存在');
 const people=await all<{id:string;uid:string|null;name:string}>(env.DB,'SELECT * FROM revision_people WHERE revision_id=?',r.id);
 const contacts=await first<{contact_person_id:string;uploader_person_id:string}>(env.DB,'SELECT * FROM revision_contacts WHERE revision_id=?',r.id);
 const p=(pid?:string)=>{const v=people.find(x=>x.id===pid);return {uid:v?.uid??'',name:v?.name??''};};
 const contributors=await all<{person_id:string;role_option_id:string|null;work_detail:string;role_other:string}>(env.DB,'SELECT * FROM contributors WHERE revision_id=? ORDER BY position',r.id);
 const reviews=await all<Review>(env.DB,'SELECT '+(user.role==='admin'?'rv.*':'rv.id,rv.revision_id,rv.action,rv.reason,rv.created_at')+' FROM reviews rv JOIN submission_revisions r ON r.id=rv.revision_id WHERE r.submission_id=? ORDER BY rv.created_at DESC',s.id);
 const labels=await all<{id:string;label:string}>(env.DB,'SELECT DISTINCT o.id,o.label FROM bili_role_options o JOIN contributors c ON c.role_option_id=o.id JOIN submission_revisions r ON r.id=c.revision_id WHERE r.submission_id=?',s.id);
 const uploadedFile=await first<{id:string;filename:string;size:number;content_type:string;state:string}>(env.DB,'SELECT u.id,u.filename,u.size,u.content_type,u.state FROM uploads u JOIN revision_uploads ru ON ru.upload_id=u.id WHERE ru.revision_id=?',r.id);
 const category=await first<Category>(env.DB,'SELECT * FROM bili_categories WHERE id=?',r.category_id);const limit=category?.verified_at?category.staff_limit:null;
 return {staff_limit:limit??null,staff_limit_verified:!!category?.verified_at,warnings:limit&&contributors.length>limit?[`制作人员 ${contributors.length} 人，超过已核实的联投上限 ${limit} 人，请安排平台投稿人员；完整名单已保留。`]:[],uploaded_file:uploadedFile??null,submission:s,revision:r,revisions,reviews,role_labels:Object.fromEntries(labels.map(x=>[x.id,x.label])),form:{upload_id:uploadedFile?.id??null,type_other:(r as Revision & {type_other:string}).type_other,category_other:(r as Revision & {category_other:string}).category_other,title:r.title,type:r.type,description:r.description,duration_seconds:r.duration_seconds,category_id:r.category_id,delivery_url:r.delivery_url,access_notes:r.access_notes,notes:r.notes,contact:p(contacts?.contact_person_id),uploader:p(contacts?.uploader_person_id),contributors:contributors.map(x=>({...p(x.person_id),role_option_id:x.role_option_id,work_detail:x.work_detail,role_other:x.role_other}))},
 ...(user.role==='admin'?{notifications:await all<{id:string;status:string;attempts:number;last_error:string|null}>(env.DB,'SELECT id,status,attempts,last_error FROM email_outbox WHERE submission_id=? ORDER BY created_at DESC',s.id)}:{})};
}
export async function createDraft(env:Env,user:User,input:unknown){
 const data=parse(z.object({event_id:z.string(),operation_id:z.string().min(1).max(100)}).strict(),input);
 const old=await previous<{id:string}>(env.DB,user,'submission.create',data.operation_id,data);if(old.result)return old.result;
 const event=await first<Event>(env.DB,'SELECT * FROM events WHERE id=? AND active=1',data.event_id);if(!event)throw new AppError(422,'活动不存在');
 const sid=id(),rid=id(),key=id(),time=now();const result={id:sid};
 await atomic(env.DB,[guard(env.DB,key,'EXISTS(SELECT 1 FROM events WHERE id=? AND active=1)',event.id),
 sql(env.DB,'INSERT INTO submissions(id,event_id,owner_user_id,public_number,created_at,updated_at) VALUES(?,?,?,?,?,?)',sid,event.id,user.id,'USG-'+event.year+'-'+sid.slice(0,8).toUpperCase(),time,time),
 sql(env.DB,'INSERT INTO submission_revisions(id,submission_id,revision_no,feedback_email,created_at) VALUES(?,?,1,?,?)',rid,sid,user.email,time),
 operationResult(env.DB,user,'submission.create',data.operation_id,old.hash,result),cleanup(env.DB,key)]);return result;
}
export async function saveDraft(env:Env,user:User,sid:string,input:unknown){
 const data=parse(z.object({expectedVersion:z.number().int().min(1),form:submissionDraft}).strict(),input);const d=await detail(env,user,sid);
 if(d.submission.owner_user_id!==user.id)throw new AppError(403,'仅投稿者本人可以修改');
 if(!['draft','rejected'].includes(d.submission.status))throw new AppError(409,'审核期间和已通过的投稿不能修改');
 const f=data.form;if(f.upload_id&&!await first(env.DB,"SELECT id FROM uploads WHERE id=? AND submission_id=? AND state='complete'",f.upload_id,sid))throw new AppError(422,'作品文件不可用，请完成上传后重试');const canonical=(v:string)=>v?v.replace(/^0+/,''):null;
 const seen=new Set<string>();for(const p of f.contributors){const u=canonical(p.uid);if(u && seen.has(u))throw new AppError(422,'同一 UID 不能重复');if(u)seen.add(u);}
 const names=new Map<string,string>();for(const p of [f.contact,f.uploader,...f.contributors]){const u=canonical(p.uid);if(u && names.has(u) && names.get(u)!==p.name)throw new AppError(422,'同一 UID 的名称需要一致');if(u)names.set(u,p.name);if(u && !/^[0-9]+$/.test(u))throw new AppError(422,'UID 必须是数字字符串');}
 const copy=!!d.revision.submitted_at;const rid=copy?id():d.revision.id;const key=id();const time=now();const statements=[
 guard(env.DB,key,"EXISTS(SELECT 1 FROM submissions WHERE id=? AND owner_user_id=? AND version=? AND status IN('draft','rejected'))",sid,user.id,data.expectedVersion),
 sql(env.DB,'UPDATE submissions SET version=version+1,updated_at=? WHERE id=?',time,sid)
 ];
 if(copy)statements.push(sql(env.DB,'INSERT INTO submission_revisions(id,submission_id,revision_no,feedback_email,created_at) VALUES(?,?,?,?,?)',rid,sid,d.revision.revision_no+1,user.email,time));
 statements.push(sql(env.DB,'UPDATE submission_revisions SET title=?,type=?,description=?,duration_seconds=?,category_id=?,delivery_url=?,access_notes=?,notes=?,type_other=?,category_other=? WHERE id=?',f.title,f.type,f.description,f.duration_seconds,f.category_id||null,f.delivery_url,f.access_notes,f.notes,f.type_other,f.category_other,rid));
 if(!copy)statements.push(sql(env.DB,'DELETE FROM contributors WHERE revision_id=?',rid),sql(env.DB,'DELETE FROM revision_contacts WHERE revision_id=?',rid),sql(env.DB,'DELETE FROM revision_people WHERE revision_id=?',rid));
 const people=new Map<string,string>();const personId=(p:{name:string;uid:string})=>{const u=canonical(p.uid),mapKey=u??id();let pid=people.get(mapKey);if(!pid){pid=id();people.set(mapKey,pid);statements.push(sql(env.DB,'INSERT INTO revision_people VALUES(?,?,?,?)',pid,rid,u,p.name));}return pid;};
 const contact=personId(f.contact),uploader=personId(f.uploader);statements.push(sql(env.DB,'INSERT INTO revision_contacts VALUES(?,?,?)',rid,contact,uploader));
 f.contributors.forEach((p,i)=>{const pid=personId(p);statements.push(sql(env.DB,'INSERT INTO contributors(revision_id,person_id,role_option_id,work_detail,position,role_other) VALUES(?,?,?,?,?,?)',rid,pid,p.role_option_id||null,p.work_detail,i,p.role_other));});
 if(!copy)statements.push(sql(env.DB,'DELETE FROM revision_uploads WHERE revision_id=?',rid));
 if(f.upload_id)statements.push(guard(env.DB,key+'-upload',"EXISTS(SELECT 1 FROM uploads WHERE id=? AND submission_id=? AND state='complete')",f.upload_id,sid),cleanup(env.DB,key+'-upload'),sql(env.DB,'INSERT INTO revision_uploads(revision_id,upload_id) VALUES(?,?)',rid,f.upload_id));
 statements.push(cleanup(env.DB,key));await atomic(env.DB,statements);return {version:data.expectedVersion+1,revision_id:rid};
}
export async function submit(env:Env,user:User,sid:string,input:unknown){
 const data=parse(z.object({expectedVersion:z.number().int(),operation_id:z.string().min(1).max(100),confirmed:z.literal(true)}).strict(),input);
 const old=await previous<{ok:boolean}>(env.DB,user,'submission.submit:'+sid,data.operation_id,data);if(old.result)return old.result;
 const d=await detail(env,user,sid);if(d.submission.owner_user_id!==user.id)throw new AppError(403,'仅本人可以提交');
 const f=parse(completeSubmission,d.form);const config=await formConfig(env);const event=config.events.find(x=>x.id===d.submission.event_id);
 if(!event || !event.submissions_open || (event.opens_at && event.opens_at>now()) || (event.closes_at && event.closes_at<now()))throw new AppError(422,'当前不在征稿时间内');
 if(!config.categories.some(x=>x.id===f.category_id))throw new AppError(422,'该分区尚未核实或已停用');
 for(const p of f.contributors)if(!config.roles.some(x=>x.id===p.role_option_id && x.category_id===f.category_id))throw new AppError(422,'制作人员职务与分区不匹配，请重新选择');
 if(config.categories.find(x=>x.id===f.category_id)?.name==='其他'&&!f.category_other.trim())throw new AppError(422,'请说明具体分区');
 for(const p of f.contributors)if(config.roles.find(x=>x.id===p.role_option_id)?.label==='其他'&&!p.role_other.trim())throw new AppError(422,'请说明具体职务');
 if(f.upload_id&&!d.uploaded_file)throw new AppError(422,'作品文件尚未上传完成');
 const key=id(),time=now();
 const checks=[guard(env.DB,key+'-category','EXISTS(SELECT 1 FROM bili_categories WHERE id=? AND enabled=1'+(env.ENVIRONMENT==='development'?'':" AND (verified_at IS NOT NULL OR origin='festival-default')")+')',f.category_id),...f.contributors.map((p,i)=>guard(env.DB,key+'-role-'+i,'EXISTS(SELECT 1 FROM bili_role_options WHERE id=? AND category_id=? AND enabled=1'+(env.ENVIRONMENT==='development'?'':" AND (verified_at IS NOT NULL OR origin='festival-default')")+')',p.role_option_id,f.category_id))];
 await atomic(env.DB,[...checks,guard(env.DB,key,"EXISTS(SELECT 1 FROM submissions s JOIN events e ON e.id=s.event_id JOIN submission_revisions r ON r.submission_id=s.id WHERE s.id=? AND s.owner_user_id=? AND s.version=? AND s.status IN('draft','rejected') AND r.id=? AND r.submitted_at IS NULL AND e.submissions_open=1 AND (e.opens_at IS NULL OR e.opens_at<=?) AND (e.closes_at IS NULL OR e.closes_at>=?))",sid,user.id,data.expectedVersion,d.revision.id,time,time),
  sql(env.DB,'UPDATE submission_revisions SET submitted_at=? WHERE id=?',time,d.revision.id),sql(env.DB,"UPDATE submissions SET status='pending',version=version+1,updated_at=? WHERE id=?",time,sid),
  outbox(env.DB,sid,'submit:'+d.revision.id,user.email,event.name+' · 收稿回执',`${d.submission.public_number}\n节目：${f.title}\n活动：${event.name}\n版本：${d.revision.revision_no}\n状态：待审核\n${env.APP_ORIGIN}/submit/${sid}`),
  cleanup(env.DB,key+'-category'),...f.contributors.map((_,i)=>cleanup(env.DB,key+'-role-'+i)),audit(env.DB,user,'submission',sid,'submit',{revision:d.revision.id}),operationResult(env.DB,user,'submission.submit:'+sid,data.operation_id,old.hash,{ok:true}),cleanup(env.DB,key)]);
 return {ok:true};
}
export async function review(env:Env,user:User,hash:string,sid:string,input:unknown,reopen=false){
 requireModule(user,'review');
 const data=parse(z.object({expectedVersion:z.number().int(),expectedRevision:z.string(),operation_id:z.string().min(1).max(100),decision:z.enum(['approved','rejected']).optional(),reason:z.string().max(2000).default(''),internal_note:z.string().max(2000).default('')}).strict(),input);
 const action=reopen?'reopen':data.decision;if(!action)throw new AppError(422,'请选择审核结果');if(action!=='approved' && !data.reason.trim())throw new AppError(422,'请填写原因');
 const scope='review:'+sid+':'+action,old=await previous<{ok:boolean}>(env.DB,user,scope,data.operation_id,data);if(old.result)return old.result;
 const d=await detail(env,user,sid);const event=await first<Event>(env.DB,'SELECT * FROM events WHERE id=?',d.submission.event_id);if(!event)throw new AppError(404,'活动不存在');
 const key=id(),reviewId=id(),time=now();
 await atomic(env.DB,[moduleGuard(env.DB,key+'-permission',user,hash,'review'),cleanup(env.DB,key+'-permission'),guard(env.DB,key,"EXISTS(SELECT 1 FROM submissions s JOIN submission_revisions r ON r.submission_id=s.id WHERE s.id=? AND s.version=? AND s.status=? AND r.id=? AND r.revision_no=(SELECT MAX(revision_no) FROM submission_revisions WHERE submission_id=s.id))",sid,data.expectedVersion,reopen?'approved':'pending',data.expectedRevision),
  sql(env.DB,'UPDATE submissions SET status=?,version=version+1,updated_at=? WHERE id=?',action==='approved'?'approved':'rejected',time,sid),
  sql(env.DB,'INSERT INTO reviews VALUES(?,?,?,?,?,?,?)',reviewId,data.expectedRevision,user.id,action,data.reason,data.internal_note,time),
  outbox(env.DB,sid,'review:'+reviewId,d.revision.feedback_email,event.name+' · '+(action==='approved'?'审核通过':action==='reopen'?'退回修改':'审核驳回'),`${d.submission.public_number}\n节目：${d.revision.title}\n活动：${event.name}\n版本：${d.revision.revision_no}\n结果：${action==='approved'?'通过':action==='reopen'?'之前通过已撤回，请修改重交':'驳回'}\n${data.reason}\n${env.APP_ORIGIN}/submit/${sid}`),
  audit(env.DB,user,'submission',sid,action,{revision:data.expectedRevision,reason:data.reason}),operationResult(env.DB,user,scope,data.operation_id,old.hash,{ok:true}),cleanup(env.DB,key)]);return {ok:true};
}
export async function listSubmissions(env:Env,query:URLSearchParams){
 const page=Math.max(1,Number(query.get('page'))||1),limit=20;const values:unknown[]=[];let where="s.deleted_at IS NULL AND s.status<>'draft'";
 for(const [key,field]of [['event','s.event_id'],['status','s.status'],['type','r.type']] as const){if(query.get(key)){where+=' AND '+field+'=?';values.push(query.get(key));}}
 const planned=query.get('planned');if(planned==='yes'||planned==='no')where+=` AND ${planned==='no'?'NOT ':''}EXISTS(SELECT 1 FROM program_items pi JOIN submission_revisions pr ON pr.id=pi.revision_id WHERE pr.submission_id=s.id)`;
 if(query.get('q')){where+=' AND (r.title LIKE ? OR p.name LIKE ? OR p.uid LIKE ?)';values.push(...Array(3).fill('%'+query.get('q')+'%'));}
 const from=' FROM submissions s JOIN submission_revisions r ON r.submission_id=s.id AND r.revision_no=(SELECT MAX(revision_no) FROM submission_revisions WHERE submission_id=s.id) LEFT JOIN revision_contacts rc ON rc.revision_id=r.id LEFT JOIN revision_people p ON p.id=rc.contact_person_id WHERE '+where;
 return {page,total:(await first<{n:number}>(env.DB,'SELECT COUNT(*) AS n'+from,...values))?.n??0,items:await all<Submission & {title:string;type:string;duration_seconds:number;revision_id:string;contact_name:string;contact_uid:string;planned:number}>(env.DB,'SELECT s.*,r.title,r.type,r.duration_seconds,r.id AS revision_id,p.name AS contact_name,p.uid AS contact_uid,EXISTS(SELECT 1 FROM program_items pi WHERE pi.revision_id=r.id) AS planned'+from+' ORDER BY s.updated_at DESC LIMIT ? OFFSET ?',...values,limit,(page-1)*limit)};
}

export async function deleteDraft(env:Env,user:User,hash:string,sid:string,input:unknown){
 const v=parse(z.object({expectedVersion:z.number().int().min(1),operation_id:z.string().uuid()}).strict(),input),scope='submission.delete:'+sid;
 const old=await previous<{ok:boolean}>(env.DB,user,scope,v.operation_id,v);if(old.result)return old.result;
 const d=await detail(env,user,sid);if(d.submission.owner_user_id!==user.id)throw new AppError(403,'仅本人可以删除草稿');
 if(d.submission.status!=='draft'||d.revisions.some(r=>r.submitted_at))throw new AppError(409,'已经提交过的投稿不能删除');
 const key=id(),time=now();
 await atomic(env.DB,[guard(env.DB,key,"EXISTS(SELECT 1 FROM submissions WHERE id=? AND owner_user_id=? AND version=? AND status='draft' AND deleted_at IS NULL) AND NOT EXISTS(SELECT 1 FROM submission_revisions WHERE submission_id=? AND submitted_at IS NOT NULL) AND EXISTS(SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.user_id=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.disabled_at IS NULL)",sid,user.id,v.expectedVersion,sid,hash,user.id,time),
 sql(env.DB,'UPDATE submissions SET deleted_at=?,version=version+1,updated_at=? WHERE id=?',time,time,sid),
 sql(env.DB,'DELETE FROM revision_uploads WHERE revision_id IN(SELECT id FROM submission_revisions WHERE submission_id=?)',sid),
 sql(env.DB,"UPDATE uploads SET state='aborted',expires_at=? WHERE submission_id=?",new Date(Date.now()-8*86400000).toISOString(),sid),
 audit(env.DB,user,'submission',sid,'draft.delete',{}),operationResult(env.DB,user,scope,v.operation_id,old.hash,{ok:true}),cleanup(env.DB,key)]);
 return {ok:true};
}
