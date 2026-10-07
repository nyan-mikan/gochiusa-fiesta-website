import {z} from 'zod';
import type {User} from '../../shared/models';
import {canAccess} from '../../shared/modules';
import {MAX_UPLOAD_SIZE,UPLOAD_PART_SIZE,videoContentType} from '../../shared/uploads';
import {verifyVideo} from './video-file';
import {all,first,sql,AppError,parse,id,now,atomic,guard,cleanup} from './core';
interface Upload {id:string;submission_id:string;object_key:string;multipart_id:string;filename:string;size:number;content_type:string;state:string;expires_at:string}
// Existing files are not backfilled by a migration. Verify a legacy video only
// when its owner saves/submits a new draft; historical nonvideo files stay intact.
export async function requireVideoUpload(env:Env,sid:string,uid:string){
 const u=await first<Upload & {container:string|null}>(env.DB,"SELECT u.*,v.container FROM uploads u LEFT JOIN upload_videos v ON v.upload_id=u.id WHERE u.id=? AND u.submission_id=? AND u.state='complete'",uid,sid);
 if(!u)throw new AppError(422,'作品文件不可用，请完成视频上传后重试');
 if(u.container)return;
 const type=videoContentType(u.filename,u.content_type);if(!type)throw new AppError(422,'请移除原附件，作品交付只支持上传视频');
 if(!env.UPLOADS)throw new AppError(503,'视频上传暂时不可用');const container=await verifyVideo(env.UPLOADS,u.object_key,u.size,type);
 await sql(env.DB,"INSERT INTO upload_videos(upload_id,container) SELECT id,? FROM uploads WHERE id=? AND state='complete' ON CONFLICT(upload_id) DO NOTHING",container,uid).run();
}
const writable="(s.status IN('draft','rejected') OR (s.status IN('pending','approved') AND NOT EXISTS(SELECT 1 FROM submission_revisions r WHERE r.submission_id=s.id AND r.revision_no=(SELECT MAX(revision_no) FROM submission_revisions WHERE submission_id=s.id) AND (EXISTS(SELECT 1 FROM revision_uploads WHERE revision_id=r.id) OR EXISTS(SELECT 1 FROM revision_deliveries WHERE revision_id=r.id)))))";
async function owned(env:Env,user:User,uid:string,write=false){
 const u=await first<Upload & {owner_user_id:string;status:string}>(env.DB,'SELECT u.*,s.owner_user_id,s.status FROM uploads u JOIN submissions s ON s.id=u.submission_id WHERE u.id=? AND s.deleted_at IS NULL',uid);
 if(!u||(u.owner_user_id!==user.id&&(write||!canAccess(user,'review'))))throw new AppError(404,'文件不存在');
 if(write&&(u.expires_at<now()||!await first(env.DB,'SELECT s.id FROM submissions s WHERE s.id=? AND s.deleted_at IS NULL AND '+writable,u.submission_id)))throw new AppError(409,'上传已到期或此投稿已经交付，请刷新后重试');return u;
}
export async function createUpload(env:Env,user:User,sid:string,input:unknown){
 const v=parse(z.object({filename:z.string().trim().min(1).max(240),size:z.number().int().min(1).max(MAX_UPLOAD_SIZE,'文件不能超过 1 GB'),content_type:z.string().max(100).regex(/^[\w.+-]+\/[\w.+-]+$/).default('application/octet-stream')}).strict(),input);
 if(!env.UPLOADS)throw new AppError(503,'文件上传暂时不可用，请先保存草稿');
 const s=await first<{owner_user_id:string;status:string}>(env.DB,'SELECT s.owner_user_id,s.status FROM submissions s WHERE s.id=? AND s.deleted_at IS NULL',sid);
 if(!s||s.owner_user_id!==user.id)throw new AppError(404,'投稿不存在');if(!await first(env.DB,'SELECT s.id FROM submissions s WHERE s.id=? AND '+writable,sid))throw new AppError(409,'此投稿已经交付，请刷新后重试');
 const contentType=videoContentType(v.filename,v.content_type);if(!contentType)throw new AppError(422,'作品交付只接受 MP4、MOV、WebM 或 MKV 视频');
 const active=await first<{n:number}>(env.DB,"SELECT COUNT(*) n FROM uploads WHERE submission_id=? AND state IN('receiving','completing') AND expires_at>?",sid,now());if((active?.n??0)>=3)throw new AppError(429,'已有上传任务，请完成或取消后再上传');
 const uid=id(),key='works/'+sid+'/'+uid,filename=v.filename.replace(/[\r\n\x00-\x1f]/g,'_');
 const m=await env.UPLOADS.createMultipartUpload(key,{httpMetadata:{contentType:'application/octet-stream',contentDisposition:"attachment; filename*=UTF-8''"+encodeURIComponent(filename)},customMetadata:{submission:sid,upload:uid}});
 try{await sql(env.DB,'INSERT INTO uploads(id,submission_id,object_key,multipart_id,filename,size,content_type,state,created_at,expires_at) VALUES(?,?,?,?,?,?,?,\'receiving\',?,?)',uid,sid,key,m.uploadId,filename,v.size,contentType,now(),new Date(Date.now()+24*3600_000).toISOString()).run();}catch(e){await m.abort();if(e instanceof Error&&e.message.includes('draft_deleted'))throw new AppError(409,'草稿已删除，无法继续上传');throw e;}
 return {id:uid,part_size:UPLOAD_PART_SIZE,filename,size:v.size};
}
export async function uploadPart(env:Env,user:User,uid:string,number:number,request:Request){
 const u=await owned(env,user,uid,true);if(u.state!=='receiving')throw new AppError(409,'上传已结束');
 const count=Math.ceil(u.size/UPLOAD_PART_SIZE);if(!Number.isInteger(number)||number<1||number>count)throw new AppError(422,'分片编号无效');
 const expected=Math.min(UPLOAD_PART_SIZE,u.size-(number-1)*UPLOAD_PART_SIZE);
 // The route's body limiter bounds this buffer to 10 MiB, never the entire file.
 const data=await request.arrayBuffer();if(data.byteLength!==expected)throw new AppError(422,'分片大小与文件声明不一致');
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),n=>n.toString(16).padStart(2,'0')).join('');
 const before=await first<{sha256:string;etag:string|null}>(env.DB,'SELECT sha256,etag FROM upload_parts WHERE upload_id=? AND part_number=?',uid,number);
 if(before&&before.sha256!==sha)throw new AppError(409,'同一分片内容不一致，请重新上传文件');if(before?.etag)return {part_number:number};
 const key=id();await atomic(env.DB,[guard(env.DB,key,"EXISTS(SELECT 1 FROM uploads WHERE id=? AND state='receiving') AND NOT EXISTS(SELECT 1 FROM upload_parts WHERE upload_id=? AND part_number=? AND sha256<>?)",uid,uid,number,sha),sql(env.DB,'INSERT INTO upload_parts(upload_id,part_number,size,sha256) VALUES(?,?,?,?) ON CONFLICT(upload_id,part_number) DO NOTHING',uid,number,data.byteLength,sha),cleanup(env.DB,key)]);
 const part=await env.UPLOADS.resumeMultipartUpload(u.object_key,u.multipart_id).uploadPart(number,data);
 await sql(env.DB,'UPDATE upload_parts SET etag=? WHERE upload_id=? AND part_number=? AND sha256=?',part.etag,uid,number,sha).run();return {part_number:number};
}
export async function completeUpload(env:Env,user:User,uid:string){
 const u=await owned(env,user,uid,true);if(u.state==='complete')return {id:u.id,filename:u.filename,size:u.size,content_type:u.content_type,state:'complete'};
 if(!['receiving','completing'].includes(u.state))throw new AppError(409,'上传已取消');
 const parts=await all<{part_number:number;size:number;etag:string|null}>(env.DB,'SELECT * FROM upload_parts WHERE upload_id=? ORDER BY part_number',uid);
 if(parts.length!==Math.ceil(u.size/UPLOAD_PART_SIZE)||parts.reduce((n,p)=>n+p.size,0)!==u.size||parts.some((p,i)=>!p.etag||p.part_number!==i+1))throw new AppError(422,'文件尚未完整上传');
 await sql(env.DB,"UPDATE uploads SET state='completing' WHERE id=? AND state='receiving'",uid).run();
 if((await first<{state:string}>(env.DB,'SELECT state FROM uploads WHERE id=?',uid))?.state==='aborted')throw new AppError(409,'上传已取消');
 let object=await env.UPLOADS.head(u.object_key);
 if(!object)try{object=await env.UPLOADS.resumeMultipartUpload(u.object_key,u.multipart_id).complete(parts.map(p=>({partNumber:p.part_number,etag:p.etag!})));}catch(e){object=await env.UPLOADS.head(u.object_key);if(!object)throw e;}
 if(object.size!==u.size||object.size>MAX_UPLOAD_SIZE)throw new AppError(422,'文件大小校验失败');
 let container:string;try{container=await verifyVideo(env.UPLOADS,u.object_key,u.size,u.content_type);}catch(e){if(e instanceof AppError&&e.status===422){await sql(env.DB,"UPDATE uploads SET state='aborted' WHERE id=? AND state='completing'",uid).run();await env.UPLOADS.delete(u.object_key);}throw e;}
 const results=await atomic(env.DB,[sql(env.DB,"INSERT INTO upload_videos(upload_id,container) SELECT id,? FROM uploads WHERE id=? AND state IN('completing','complete') ON CONFLICT(upload_id) DO NOTHING",container,uid),sql(env.DB,"UPDATE uploads SET state='complete' WHERE id=? AND state='completing' AND EXISTS(SELECT 1 FROM submissions s WHERE s.id=uploads.submission_id AND s.deleted_at IS NULL)",uid)]);const finished=results[1]!;if(!finished.meta.changes){const live=await first(env.DB,"SELECT u.id FROM uploads u JOIN submissions s ON s.id=u.submission_id WHERE u.id=? AND u.state='complete' AND s.deleted_at IS NULL",uid);if(!live)throw new AppError(409,'上传已取消或草稿已删除');}return {id:u.id,filename:u.filename,size:u.size,content_type:u.content_type,state:'complete'};
}
export async function abortUpload(env:Env,user:User,uid:string){
 const u=await owned(env,user,uid,true);if(u.state==='aborted')return {ok:true};if(u.state!=='receiving')throw new AppError(409,'文件已完成，移除草稿中的文件引用即可');
 const result=await sql(env.DB,"UPDATE uploads SET state='aborted' WHERE id=? AND state='receiving'",uid).run();if(!result.meta.changes)throw new AppError(409,'上传已进入确认阶段');await env.UPLOADS.resumeMultipartUpload(u.object_key,u.multipart_id).abort();return {ok:true};
}
export async function downloadUpload(env:Env,user:User,uid:string,request:Request){
 const u=await owned(env,user,uid);if(u.state!=='complete')throw new AppError(404,'文件尚未上传完成');
 // Arbitrary upload formats always download as attachments, preventing stored HTML execution.
 const range=request.headers.get('Range');let offset=0,length=u.size;
 if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||(!match[1]&&!match[2]))return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+u.size}});
  if(match[1]){offset=Number(match[1]);length=(match[2]?Math.min(Number(match[2]),u.size-1):u.size-1)-offset+1;}else{length=Math.min(Number(match[2]),u.size);offset=u.size-length;}
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||offset>=u.size||length<=0)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+u.size}});
 }
 const object=await env.UPLOADS.get(u.object_key,{range:{offset,length}});if(!object)throw new AppError(404,'文件不存在');
 const headers=new Headers({'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(u.filename),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','Content-Length':String(length),'ETag':object.httpEtag});if(range)headers.set('Content-Range',`bytes ${offset}-${offset+length-1}/${u.size}`);
 return new Response(object.body,{status:range?206:200,headers});
}
export async function cleanupUploads(env:Env){
 if(!env.UPLOADS)return;
 const expired=await all<Upload>(env.DB,"SELECT u.* FROM uploads u WHERE expires_at<? AND NOT EXISTS(SELECT 1 FROM revision_uploads r WHERE r.upload_id=u.id) AND NOT EXISTS(SELECT 1 FROM revision_deliveries d WHERE d.upload_id=u.id) LIMIT 10",new Date(Date.now()-6*24*3600_000).toISOString());
 for(const u of expired){const marked=await sql(env.DB,"UPDATE uploads SET state='aborted' WHERE id=? AND NOT EXISTS(SELECT 1 FROM revision_uploads WHERE upload_id=?) AND NOT EXISTS(SELECT 1 FROM revision_deliveries WHERE upload_id=?)",u.id,u.id,u.id).run();if(!marked.meta.changes)continue;if(u.state==='receiving'||u.state==='aborted')try{await env.UPLOADS.resumeMultipartUpload(u.object_key,u.multipart_id).abort();}catch{/* Already aborted or removed by R2 lifecycle. */}
 await env.UPLOADS.delete(u.object_key);await env.DB.batch([sql(env.DB,'DELETE FROM upload_parts WHERE upload_id=?',u.id),sql(env.DB,'DELETE FROM uploads WHERE id=? AND NOT EXISTS(SELECT 1 FROM revision_uploads WHERE upload_id=?) AND NOT EXISTS(SELECT 1 FROM revision_deliveries WHERE upload_id=?)',u.id,u.id,u.id)]);}
}
