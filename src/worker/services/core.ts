import { z } from 'zod';
import type { User } from '../../shared/models';

export class AppError extends Error {constructor(public status:number,message:string,public details:unknown=null){super(message);}}
export const now=()=>new Date().toISOString();
export const id=()=>crypto.randomUUID();
export const sql=(db:D1Database,query:string,...values:unknown[])=>db.prepare(query).bind(...values);
export async function first<T>(db:D1Database,query:string,...values:unknown[]){return sql(db,query,...values).first<T>();}
export async function all<T>(db:D1Database,query:string,...values:unknown[]){return (await sql(db,query,...values).all<T>()).results;}
export function parse<T>(schema:z.ZodType<T>,data:unknown):T {const r=schema.safeParse(data);if(!r.success)throw new AppError(422,'请检查填写内容',r.error.flatten());return r.data;}
export const sha=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
export const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
export async function hmac(secret:string,value:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export function cookie(request:Request,name:string){return request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)??'';}
export async function sessionHash(request:Request){const t=cookie(request,'usagi_session');return t?sha(t):'';}
export async function actor(env:Env,hash:string,admin=false,superAdmin=false):Promise<User>{
 const user=await first<Omit<User,'is_super_admin'> & {is_super_admin:number}>(env.DB,"SELECT u.id,u.email,u.role,EXISTS(SELECT 1 FROM user_capabilities p WHERE p.user_id=u.id AND p.capability='manage_admins') AS is_super_admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.disabled_at IS NULL",hash,now());
 if(!user)throw new AppError(401,'请先登录');if(admin && user.role!=='admin')throw new AppError(403,'仅管理员可以访问');if(superAdmin && (user.role!=='admin'||!user.is_super_admin))throw new AppError(403,'仅超级管理员可以任免管理员');return {...user,is_super_admin:!!user.is_super_admin};
}
export function guard(db:D1Database,key:string,condition:string,...values:unknown[]){return sql(db,'INSERT INTO transaction_assertions(id,valid) VALUES (?,CASE WHEN '+condition+' THEN 1 ELSE 0 END)',key,...values);}
export function cleanup(db:D1Database,key:string){return sql(db,'DELETE FROM transaction_assertions WHERE id=?',key);}
export function audit(db:D1Database,user:User,objectType:string,objectId:string,action:string,summary:unknown){return sql(db,'INSERT INTO audit_logs VALUES (?,?,?,?,?,?,?)',id(),user.id,objectType,objectId,action,JSON.stringify(summary),now());}
export async function atomic(db:D1Database,statements:D1PreparedStatement[]){
 try{return await db.batch(statements);}catch(error){
  const message=error instanceof Error?error.message:'';
  if(/wish_frozen|wish_content_required|wish_audio_not_allowed|CHECK constraint failed|UNIQUE constraint failed|program_reference_exists|program_locked|invalid_program_revision|invalid_program_item|script_locked|invalid_anchor|character_scope|character_archived|revision_frozen|role_category_mismatch/.test(message))throw new AppError(409,'数据状态已改变，请核对服务器版本后重试');
  throw error;
 }
}
export async function previous<T>(db:D1Database,user:User,scope:string,operationId:string,payload:unknown){
 const hash=await sha(JSON.stringify(payload));const old=await first<{request_hash:string;result_json:string}>(db,'SELECT request_hash,result_json FROM operation_results WHERE actor_id=? AND scope=? AND operation_id=?',user.id,scope,operationId);
 if(old && old.request_hash!==hash)throw new AppError(409,'同一操作编号不能用于不同内容');return {hash,result:old?JSON.parse(old.result_json) as T:null};
}
export function operationResult(db:D1Database,user:User,scope:string,operationId:string,hash:string,result:unknown){return sql(db,'INSERT INTO operation_results VALUES (?,?,?,?,?,?)',user.id,scope,operationId,hash,JSON.stringify(result),now());}
