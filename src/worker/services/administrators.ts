import { z } from 'zod';
import type { ManagedUser, User } from '../../shared/models';
import { all, AppError, atomic, audit, cleanup, first, guard, id, now, operationResult, parse, previous, sql } from './core';

function requireSuper(user:User){if(user.role!=='admin'||!user.is_super_admin)throw new AppError(403,'仅超级管理员可以任免管理员');}
type AccountRow=Omit<ManagedUser,'is_super_admin'|'modules'> & {is_super_admin:number;modules_json:string};
const accountColumns="u.id,u.email,u.nickname,u.role,(SELECT json_group_array(module) FROM module_grants WHERE user_id=u.id) AS modules_json,u.admin_version AS version,u.verified_at,u.created_at,EXISTS(SELECT 1 FROM user_capabilities p WHERE p.user_id=u.id AND p.capability='manage_admins') AS is_super_admin";
export async function listAccounts(env:Env,user:User,query:URLSearchParams){
 requireSuper(user);
 const page=parse(z.coerce.number().int().min(1).max(100000),query.get('page')??1);
 const search=parse(z.string().trim().max(254),query.get('search')??'');
 const where='u.disabled_at IS NULL AND instr(lower(u.email),lower(?))>0';
 const total=(await first<{n:number}>(env.DB,'SELECT COUNT(*) AS n FROM users u WHERE '+where,search))?.n??0;
 const rows=await all<AccountRow>(env.DB,'SELECT '+accountColumns+' FROM users u WHERE '+where+' ORDER BY is_super_admin DESC,u.role,u.email LIMIT 30 OFFSET ?',search,(page-1)*30);
 return {users:rows.map(({modules_json,...u})=>({...u,is_super_admin:!!u.is_super_admin,modules:JSON.parse(modules_json)})),total,page,page_size:30};
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

export async function changeModules(env:Env,user:User,hash:string,input:unknown){
 requireSuper(user);
 const v=parse(z.object({user_id:z.string().min(1).max(100),expected_version:z.number().int().positive(),operation_id:z.string().uuid(),modules:z.array(z.enum(['review','program','script','characters','dictionary','settings','wishes'])).max(7).refine(x=>new Set(x).size===x.length,'模块不能重复')}).strict(),input);
 const scope='modules:'+v.user_id,old=await previous<{ok:true}>(env.DB,user,scope,v.operation_id,v);if(old.result)return old.result;
 const target=await first<AccountRow & {disabled_at:string|null}>(env.DB,'SELECT '+accountColumns+',u.disabled_at FROM users u WHERE u.id=?',v.user_id);
 if(!target||target.disabled_at)throw new AppError(404,'账号不存在或已停用');
 if(target.is_super_admin)throw new AppError(409,'超级管理员权限受保护');
 if(target.role!=='admin')throw new AppError(422,'请先任命该账号为管理员');
 if(target.version!==v.expected_version)throw new AppError(409,'账号权限已改变，请刷新并核对后重试');
 const key=id(),time=now(),result={ok:true as const};
 await atomic(env.DB,[
  guard(env.DB,key+'-authority',"EXISTS(SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id JOIN user_capabilities c ON c.user_id=u.id AND c.capability='manage_admins' WHERE s.token_hash=? AND u.id=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.role='admin' AND u.disabled_at IS NULL)",hash,user.id,time),
  guard(env.DB,key+'-target',"EXISTS(SELECT 1 FROM users u WHERE u.id=? AND u.admin_version=? AND u.role='admin' AND u.disabled_at IS NULL AND NOT EXISTS(SELECT 1 FROM user_capabilities c WHERE c.user_id=u.id AND c.capability='manage_admins'))",v.user_id,v.expected_version),
  sql(env.DB,'DELETE FROM module_grants WHERE user_id=?',v.user_id),
  ...v.modules.map(module=>sql(env.DB,'INSERT INTO module_grants(user_id,module,granted_by,granted_at) VALUES(?,?,?,?)',v.user_id,module,user.id,time)),
  // Empty-to-empty changes still invalidate the version held by another editor.
  sql(env.DB,'UPDATE users SET admin_version=admin_version+1 WHERE id=?',v.user_id),
  sql(env.DB,'UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL',time,v.user_id),
  audit(env.DB,user,'user',v.user_id,'modules.update',{before:JSON.parse(target.modules_json),after:v.modules}),
  operationResult(env.DB,user,scope,v.operation_id,old.hash,result),cleanup(env.DB,key+'-authority'),cleanup(env.DB,key+'-target')
 ]);return result;
}
