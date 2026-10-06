import {z} from 'zod';import type {User,Category} from '../../shared/models';
import {parse,previous,first,id,now,sql,guard,cleanup,atomic,audit,operationResult,AppError} from './core';import {requireModule,moduleGuard} from './module-access';
export async function saveDictionary(env:Env,user:User,hash:string,input:unknown){
 requireModule(user,'dictionary');
 const v=parse(z.object({category_id:z.string().max(100).nullable(),expectedVersion:z.number().int().positive().nullable(),operation_id:z.string().uuid(),name:z.string().trim().min(1).max(100),platform_id:z.string().max(100).nullable(),staff_limit:z.number().int().min(1).max(10000).nullable(),verified:z.boolean().optional(),evidence_url:z.string().max(2000).url().regex(/^https:\/\//),labels:z.array(z.string().trim().min(1).max(40)).min(1).max(100)}).strict(),input);
 if(new Set(v.labels).size!==v.labels.length)throw new AppError(422,'职务标签不能重复');
 const scope='dictionary.save',old=await previous<{ok:true;id:string;version:number;dictionary_version:number}>(env.DB,user,scope,v.operation_id,v);if(old.result)return old.result;
 // Keep deleted IDs and immutable role definitions for historical references. Creating the
 // same name restores that identity with new options, without reactivating old options.
 const category=v.category_id?await first<Category>(env.DB,'SELECT * FROM bili_categories WHERE id=?',v.category_id):await first<Category>(env.DB,'SELECT * FROM bili_categories WHERE lower(trim(name))=lower(?) AND enabled=0',v.name);
 if(v.category_id&&!category)throw new AppError(404,'分区不存在');
 if(v.category_id&&category&&!category.enabled)throw new AppError(409,'分区已删除，请重新读取后操作');
 if((v.category_id?category?.version:null)!==v.expectedVersion)throw new AppError(409,'分区与职务已被其他人修改，请重新读取并核对后保存');
 const cid=category?.id??id(),key=id(),time=now(),version=(await first<{v:number}>(env.DB,'SELECT COALESCE(MAX(dictionary_version),0)+1 AS v FROM bili_role_options WHERE category_id=?',cid))?.v??1;
 const result={ok:true as const,id:cid,version:(category?.version??0)+1,dictionary_version:version};
 const statements=[moduleGuard(env.DB,key+'-auth',user,hash,'dictionary'),
 category?guard(env.DB,key,'EXISTS(SELECT 1 FROM bili_categories WHERE id=? AND version=? AND enabled=?)',cid,category.version,v.category_id?1:0):guard(env.DB,key,'NOT EXISTS(SELECT 1 FROM bili_categories WHERE lower(trim(name))=lower(?))',v.name),
 guard(env.DB,key+'-name','NOT EXISTS(SELECT 1 FROM bili_categories WHERE id<>? AND lower(trim(name))=lower(?))',cid,v.name),
 category?sql(env.DB,'UPDATE bili_categories SET name=?,platform_id=?,enabled=1,verified_at=?,staff_limit=?,version=version+1 WHERE id=?',v.name,v.platform_id,time,v.staff_limit,cid):sql(env.DB,'INSERT INTO bili_categories(id,name,platform_id,enabled,verified_at,staff_limit) VALUES(?,?,?,1,?,?)',cid,v.name,v.platform_id,time,v.staff_limit),
 sql(env.DB,'UPDATE bili_role_options SET enabled=0 WHERE category_id=?',cid)];
 for(const label of v.labels)statements.push(sql(env.DB,'INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,verified_at,enabled) VALUES(?,?,?,?,?,?,1)',id(),cid,label,version,v.evidence_url,time));
 statements.push(audit(env.DB,user,'dictionary',cid,'save',{version,evidence:v.evidence_url}),operationResult(env.DB,user,scope,v.operation_id,old.hash,result),cleanup(env.DB,key),cleanup(env.DB,key+'-name'),cleanup(env.DB,key+'-auth'));
 try{await atomic(env.DB,statements);}catch(e){const replay=await previous<typeof result>(env.DB,user,scope,v.operation_id,v);if(replay.result)return replay.result;throw e;}return result;
}
export async function deleteDictionary(env:Env,user:User,hash:string,input:unknown){
 requireModule(user,'dictionary');
 const v=parse(z.object({category_id:z.string().min(1).max(100),expectedVersion:z.number().int().positive(),operation_id:z.string().uuid()}).strict(),input);
 const scope='dictionary.delete',old=await previous<{ok:true}>(env.DB,user,scope,v.operation_id,v);if(old.result)return old.result;
 const category=await first<Category>(env.DB,'SELECT * FROM bili_categories WHERE id=? AND enabled=1',v.category_id);
 if(!category)throw new AppError(404,'分区不存在或已删除');
 if(category.version!==v.expectedVersion)throw new AppError(409,'分区与职务已被其他人修改，请重新读取并核对后删除');
 const key=id(),result={ok:true as const};
 try{await atomic(env.DB,[moduleGuard(env.DB,key+'-auth',user,hash,'dictionary'),guard(env.DB,key,'EXISTS(SELECT 1 FROM bili_categories WHERE id=? AND version=? AND enabled=1)',category.id,v.expectedVersion),sql(env.DB,'UPDATE bili_categories SET enabled=0,version=version+1 WHERE id=?',category.id),sql(env.DB,'UPDATE bili_role_options SET enabled=0 WHERE category_id=?',category.id),audit(env.DB,user,'dictionary',category.id,'delete',{version:category.version+1}),operationResult(env.DB,user,scope,v.operation_id,old.hash,result),cleanup(env.DB,key),cleanup(env.DB,key+'-auth')]);}catch(e){const replay=await previous<typeof result>(env.DB,user,scope,v.operation_id,v);if(replay.result)return replay.result;throw e;}
 return result;
}
