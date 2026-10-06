import { z } from 'zod';
import type { ManagedUser, User } from '../../shared/models';
import { all, AppError, atomic, audit, cleanup, first, guard, id, now, operationResult, parse, previous, sql } from './core';

function requireSuper(user:User){if(user.role!=='admin'||!user.is_super_admin)throw new AppError(403,'仅超级管理员可以任免管理员');}
type AccountRow=Omit<ManagedUser,'is_super_admin'> & {is_super_admin:number};
const accountColumns="u.id,u.email,u.nickname,u.role,u.admin_version AS version,u.verified_at,u.created_at,EXISTS(SELECT 1 FROM user_capabilities p WHERE p.user_id=u.id AND p.capability='manage_admins') AS is_super_admin";
export async function listAccounts(env:Env,user:User,query:URLSearchParams){
 requireSuper(user);
 const page=parse(z.coerce.number().int().min(1).max(100000),query.get('page')??1);
 const search=parse(z.string().trim().max(254),query.get('search')??'');
 const where='u.disabled_at IS NULL AND instr(lower(u.email),lower(?))>0';
 const total=(await first<{n:number}>(env.DB,'SELECT COUNT(*) AS n FROM users u WHERE '+where,search))?.n??0;
 const rows=await all<AccountRow>(env.DB,'SELECT '+accountColumns+' FROM users u WHERE '+where+' ORDER BY is_super_admin DESC,u.role,u.email LIMIT 30 OFFSET ?',search,(page-1)*30);
 return {users:rows.map(u=>({...u,is_super_admin:!!u.is_super_admin})),total,page,page_size:30};
}
export async function changeAdministrator(env:Env,user:User,hash:string,input:unknown){
 requireSuper(user);
 const data=parse(z.object({email:z.string().trim().email().max(254).transform(x=>x.toLowerCase()),role:z.enum(['admin','submitter']),expected_version:z.number().int().positive().nullable(),operation_id:z.string().uuid()}).strict(),input);
 const scope='administrator:'+data.email;
 const old=await previous<{ok:true}>(env.DB,user,scope,data.operation_id,data);if(old.result)return old.result;
 const target=await first<AccountRow & {disabled_at:string|null}>(env.DB,'SELECT '+accountColumns+',u.disabled_at FROM users u WHERE u.email=?',data.email);
 if(target?.is_super_admin)throw new AppError(409,'超级管理员账号受保护，不能在此任免');
 if(target?.disabled_at)throw new AppError(409,'该账号已停用');
 if(!target&&data.role==='submitter')throw new AppError(404,'该账号不存在');
 if((target?.version??null)!==data.expected_version)throw new AppError(409,'账号权限已改变，请刷新后重试');
 const key=id(),uid=target?.id??id(),time=now(),result={ok:true as const};
 const statements=[
  guard(env.DB,key+'-authority',"EXISTS(SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id JOIN user_capabilities p ON p.user_id=u.id AND p.capability='manage_admins' WHERE s.token_hash=? AND u.id=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.disabled_at IS NULL AND u.role='admin')",hash,user.id,time),
  target?guard(env.DB,key+'-target',"EXISTS(SELECT 1 FROM users u WHERE u.id=? AND u.email=? AND u.admin_version=? AND u.disabled_at IS NULL AND NOT EXISTS(SELECT 1 FROM user_capabilities p WHERE p.user_id=u.id AND p.capability='manage_admins'))",uid,data.email,data.expected_version):guard(env.DB,key+'-target','NOT EXISTS(SELECT 1 FROM users WHERE email=?)',data.email)
 ];
 if(!target){statements.push(sql(env.DB,"INSERT INTO users(id,email,role,created_at) VALUES(?,?,'admin',?)",uid,data.email,time));}
 else if(target.role!==data.role){statements.push(sql(env.DB,'UPDATE users SET role=? WHERE id=?',data.role,uid),sql(env.DB,'UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL',time,uid));}
 if(!target||target.role!==data.role)statements.push(audit(env.DB,user,'user',uid,data.role==='admin'?'admin.grant':'admin.revoke',{email:data.email,before:target?.role??null,after:data.role}));
 statements.push(operationResult(env.DB,user,scope,data.operation_id,old.hash,result),cleanup(env.DB,key+'-authority'),cleanup(env.DB,key+'-target'));
 await atomic(env.DB,statements);return result;
}
