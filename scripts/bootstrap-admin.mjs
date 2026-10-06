import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
const [email,environment='local',requestedRole='admin']=process.argv.slice(2);
if(!email||!/^\S+@\S+\.\S+$/.test(email)||!['local','staging','production'].includes(environment)||!['admin','super_admin'].includes(requestedRole))throw new Error('用法：node scripts/bootstrap-admin.mjs 邮箱 local|staging|production [admin|super_admin]');
const q=s=>"'"+s.replaceAll("'","''")+"'",normalized=email.trim().toLowerCase(),dir=mkdtempSync(join(tmpdir(),'usagi-admin-')),file=join(dir,'admin.sql'),time=new Date().toISOString();
try{
 let query=`INSERT INTO users(id,email,role,created_at) VALUES(${q(randomUUID())},${q(normalized)},'admin',${q(time)}) ON CONFLICT(email) DO UPDATE SET role='admin';`;
 query+=`\nWITH module_names(module) AS (VALUES ('review'),('program'),('script'),('characters'),('dictionary'),('settings'),('wishes')) INSERT INTO module_grants(user_id,module,granted_by,granted_at) SELECT u.id,m.module,u.id,${q(time)} FROM users u CROSS JOIN module_names m WHERE u.email=${q(normalized)} ON CONFLICT(user_id,module) DO NOTHING;`;
 if(requestedRole==='super_admin')query+=`\nINSERT INTO user_capabilities(user_id,capability,granted_by,granted_at) SELECT id,'manage_admins',id,${q(time)} FROM users WHERE email=${q(normalized)} ON CONFLICT(user_id,capability) DO NOTHING;`;
 query+=`\nINSERT INTO audit_logs(id,actor_id,object_type,object_id,action,summary,created_at) SELECT ${q(randomUUID())},id,'user',id,'admin.bootstrap',${q(JSON.stringify({source:'controlled_cli',email:normalized,requested_role:requestedRole}))},${q(time)} FROM users WHERE email=${q(normalized)};`;
 writeFileSync(file,query,{mode:0o600});
 execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB',...(environment==='local'?['--local']:['--env',environment,'--remote']),'--file',file],{stdio:'inherit',env:{...process.env,WRANGLER_LOG_PATH:join(tmpdir(),'gochiusa-wrangler-logs'),...(environment==='local'?{XDG_CONFIG_HOME:join(tmpdir(),'gochiusa-wrangler-local')}:{})}});
}finally{rmSync(dir,{recursive:true,force:true});}
