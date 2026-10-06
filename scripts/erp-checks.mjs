import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
export async function erpChecks({request,root,admin,owner,login,localSql,event}){
 const path='/api/admin/bili-role-config',initial={category_id:null,expectedVersion:null,operation_id:randomUUID(),name:'ERP 字典 '+randomUUID().slice(0,8),platform_id:null,staff_limit:10,verified:true,evidence_url:'https://example.test/dictionary',labels:['演唱','混音']};
 await request(path,initial,owner.cookie,'PUT',403);await request(path,{...initial,expectedVersion:undefined},admin.cookie,'PUT',422);
 const created=(await request(path,initial,admin.cookie,'PUT')).v;assert.equal((await request(path,initial,admin.cookie,'PUT')).v.id,created.id);assert.equal(created.version,1);
 const history=localSql(`SELECT id,label,dictionary_version,evidence_url FROM bili_role_options WHERE category_id='${created.id}' ORDER BY label`)[0].results;
 const update={...initial,category_id:created.id,expectedVersion:1,operation_id:randomUUID(),labels:['新版演唱','后期']};
 const changes=await Promise.all([request(path,update,admin.cookie,'PUT',[200,409]),request(path,{...update,operation_id:randomUUID(),labels:['另一个编辑者']},admin.cookie,'PUT',[200,409])]);assert.equal(changes.filter(r=>r.r.status===200).length,1,'exactly one concurrent dictionary update');
 const category=localSql(`SELECT version FROM bili_categories WHERE id='${created.id}'`)[0].results[0];assert.equal(category.version,2);assert.deepEqual(localSql(`SELECT id,label,dictionary_version,evidence_url FROM bili_role_options WHERE category_id='${created.id}' AND dictionary_version=1 ORDER BY label`)[0].results,history,'historical option definitions remain immutable');
 assert.equal(localSql(`SELECT COUNT(DISTINCT dictionary_version) n FROM bili_role_options WHERE category_id='${created.id}' AND enabled=1`)[0].results[0].n,1,'one active version');
 await request(path,{...update,operation_id:randomUUID()},admin.cookie,'PUT',409);
 await request(path,{...initial,operation_id:randomUUID()},admin.cookie,'PUT',409);
 const winner=changes.find(r=>r.r.status===200);
 // Retry the known request when it won; verify that replays never add another version.
 if(changes[0].r.status===200)assert.equal((await request(path,update,admin.cookie,'PUT')).v.version,winner.v.version);
 const beforeScopes=new Set(localSql(`SELECT scope FROM rate_limits WHERE bucket=${Math.floor(Date.now()/60000)}`)[0].results.map(r=>r.scope));
 const account=await login('module-'+randomUUID().slice(0,8)+'@example.test'),find=async()=>(await request('/api/admin/users?search='+encodeURIComponent(account.user.email),undefined,root.cookie)).v.users[0];
 // Local-only time fixture: simulate the resend cooldown elapsing between permission changes.
 const minuteScope=localSql(`SELECT scope FROM rate_limits WHERE bucket=${Math.floor(Date.now()/60000)}`)[0].results.find(r=>!beforeScopes.has(r.scope))?.scope;assert.ok(minuteScope);
 const reLogin=async()=>{localSql(`DELETE FROM rate_limits WHERE scope='${minuteScope}'`);return login(account.user.email);};
 let user=await find();await request('/api/admin/users/role',{email:user.email,role:'admin',expected_version:user.version,operation_id:randomUUID()},root.cookie,'PUT');user=await find();assert.equal(user.modules.length,0);await request('/api/admin/users/modules',{user_id:user.id,expected_version:user.version,modules:['review','program','script','characters','dictionary','settings','wishes'],operation_id:randomUUID()},root.cookie,'PUT');const full=await reLogin();user=await find();assert.equal(user.modules.length,7);
 const permissions={user_id:user.id,expected_version:user.version,operation_id:randomUUID(),modules:['characters','dictionary']};
 await request('/api/admin/users/modules',permissions,admin.cookie,'PUT',403);await request('/api/admin/users/modules',{...permissions,user_id:root.user.id},root.cookie,'PUT',409);
 await request('/api/admin/users/modules',{...permissions,modules:['characters','characters']},root.cookie,'PUT',422);
 await request('/api/admin/users/modules',permissions,root.cookie,'PUT');await request('/api/admin/users/modules',permissions,root.cookie,'PUT');await request('/api/me',undefined,full.cookie,'GET',401);
 const limited=await reLogin();assert.deepEqual([...limited.user.modules].sort(),['characters','dictionary']);const base='/api/admin/events/'+event.id;
 await request(path,undefined,limited.cookie);await request(base+'/characters',undefined,limited.cookie);await request('/admin/apps',undefined,limited.cookie);
 for(const route of [base+'/%73cript','/api/admin/settings',base+'/program',base+'/script','/api/admin/submissions','/api/admin/wishes?event_id='+event.id,'/api/admin/notifications','/admin/script'])await request(route,undefined,limited.cookie,'GET',403);
 await request(base+'/script/operations',{type:'line.delete-many',operation_id:randomUUID(),items:[]},limited.cookie,'POST',403);
 const otherDraft=(await request('/api/submissions',{event_id:event.id,operation_id:randomUUID()},owner.cookie,'POST',201)).v;await request('/api/submissions/'+otherDraft.id,undefined,limited.cookie,'GET',404);
 user=await find();const grant={user_id:user.id,expected_version:user.version,modules:['program'],operation_id:randomUUID()};
 const race=await Promise.all([request('/api/admin/users/modules',grant,root.cookie,'PUT',[200,409]),request('/api/admin/users/modules',{...grant,operation_id:randomUUID()},root.cookie,'PUT',[200,409])]);assert.equal(race.filter(r=>r.r.status===200).length,1,'only one permission editor wins');
 await request('/api/me',undefined,limited.cookie,'GET',401);const program=await reLogin();assert.equal((await request(base+'/program',undefined,program.cookie)).v.lines.length,0,'program-only access does not expose script text');
 assert.ok((await request(base+'/changes?after=0',undefined,program.cookie)).v.changes.every(c=>c.type.startsWith('program.')),'changes respect module access');
 user=await find();await request('/api/admin/users/modules',{user_id:user.id,expected_version:user.version,modules:[],operation_id:randomUUID()},root.cookie,'PUT');const empty=await reLogin();await request('/admin/apps',undefined,empty.cookie);await request(base+'/realtime',undefined,empty.cookie,'GET',403);await request(path,undefined,empty.cookie,'GET',403);
 user=await find();await request('/api/admin/users/role',{email:user.email,role:'submitter',expected_version:user.version,operation_id:randomUUID()},root.cookie,'PUT');assert.equal(localSql(`SELECT COUNT(*) n FROM module_grants WHERE user_id='${user.id}'`)[0].results[0].n,0);
 console.log('PASS: dictionary version conflicts/concurrent updates, one active option version, immutable historical definitions, idempotent retries and duplicate prevention; server module permissions, protected super admin, permission edit races, session revocation, direct API/page and collaboration isolation.');
}
