import {z} from 'zod';import type {User,Category} from '../../shared/models';
import {parse,previous,first,id,now,sql,guard,cleanup,atomic,audit,operationResult,AppError} from './core';import {requireModule,moduleGuard} from './module-access';
export async function saveDictionary(env:Env,user:User,hash:string,input:unknown){
 requireModule(user,'dictionary');
 const v=parse(z.object({category_id:z.string().max(100).nullable(),expectedVersion:z.number().int().positive().nullable(),operation_id:z.string().uuid(),name:z.string().trim().min(1).max(100),platform_id:z.string().max(100).nullable(),staff_limit:z.number().int().min(1).max(10000).nullable(),verified:z.boolean(),evidence_url:z.string().max(2000).url().regex(/^https:\/\//),labels:z.array(z.string().trim().min(1).max(40)).min(1).max(100)}).strict(),input);
 if(new Set(v.labels).size!==v.labels.length)throw new AppError(422,'职务标签不能重复');
 const scope='dictionary.save',old=await previous<{ok:true;id:string;version:number;dictionary_version:number}>(env.DB,user,scope,v.operation_id,v);if(old.result)return old.result;
 const category=v.category_id?await first<Category>(env.DB,'SELECT * FROM bili_categories WHERE id=?',v.category_id):null;
 if(v.category_id&&!category)throw new AppError(404,'分区不存在');
 if((category?.version??null)!==v.expectedVersion)throw new AppError(409,'分区与职务已被其他人修改，请重新读取并核对后保存');
 const cid=category?.id??id(),key=id(),time=v.verified?now():null,version=(await first<{v:number}>(env.DB,'SELECT COALESCE(MAX(dictionary_version),0)+1 AS v FROM bili_role_options WHERE category_id=?',cid))?.v??1;
 const result={ok:true as const,id:cid,version:(category?.version??0)+1,dictionary_version:version};
 const statements=[moduleGuard(env.DB,key+'-auth',user,hash,'dictionary'),
 category?guard(env.DB,key,'EXISTS(SELECT 1 FROM bili_categories WHERE id=? AND version=?)',cid,v.expectedVersion):guard(env.DB,key,'NOT EXISTS(SELECT 1 FROM bili_categories WHERE lower(trim(name))=lower(?))',v.name),
 guard(env.DB,key+'-name','NOT EXISTS(SELECT 1 FROM bili_categories WHERE id<>? AND lower(trim(name))=lower(?))',cid,v.name),
 category?sql(env.DB,'UPDATE bili_categories SET name=?,platform_id=?,enabled=?,verified_at=?,staff_limit=?,version=version+1 WHERE id=?',v.name,v.platform_id,Number(v.verified),time,v.staff_limit,cid):sql(env.DB,'INSERT INTO bili_categories(id,name,platform_id,enabled,verified_at,staff_limit) VALUES(?,?,?,?,?,?)',cid,v.name,v.platform_id,Number(v.verified),time,v.staff_limit),
 sql(env.DB,'UPDATE bili_role_options SET enabled=0 WHERE category_id=?',cid)];
 for(const label of v.labels)statements.push(sql(env.DB,'INSERT INTO bili_role_options(id,category_id,label,dictionary_version,evidence_url,verified_at,enabled) VALUES(?,?,?,?,?,?,?)',id(),cid,label,version,v.evidence_url,time,Number(v.verified)));
 statements.push(audit(env.DB,user,'dictionary',cid,'version',{version,evidence:v.evidence_url,verified:v.verified}),operationResult(env.DB,user,scope,v.operation_id,old.hash,result),cleanup(env.DB,key),cleanup(env.DB,key+'-name'),cleanup(env.DB,key+'-auth'));
 try{await atomic(env.DB,statements);}catch(e){const replay=await previous<typeof result>(env.DB,user,scope,v.operation_id,v);if(replay.result)return replay.result;throw e;}return result;
}
