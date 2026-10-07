// Read/isolated-write functional audit probes. Run only against the local Worker.
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin='http://localhost:8787', email='audit-admin-20261005@example.test';
let cookie=''; const results=[];
async function req(path,data,method=data===undefined?'GET':'POST'){
 const r=await fetch(origin+path,{method,headers:{Cookie:cookie,Origin:origin,'X-Requested-With':'usagi',...(data!==undefined?{'Content-Type':'application/json'}:{})},body:data===undefined?undefined:JSON.stringify(data)});
 const body=await r.text();return {status:r.status,body:r.headers.get('content-type')?.includes('application/json')?JSON.parse(body):body,headers:r.headers};
}
async function ok(path,data,method){const r=await req(path,data,method);assert.ok(r.status<300,JSON.stringify({path,...r}));return r.body;}
const challenge=await ok('/api/auth/code',{email});
const mail=await (await fetch('http://127.0.0.1:8025/messages?to='+email)).json();
const code=mail.find(m=>m.key==='auth:'+challenge.challenge_id).text.match(/\d{6}/)[0];
const login=await req('/api/auth/verify',{challenge_id:challenge.challenge_id,code});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
const event=await ok('/api/admin/events',{name:'功能审计 20261005',year:2027,timezone:'Asia/Shanghai',opens_at:null,closes_at:null,submissions_open:true,wishes_open:true,active:true});
const base='/api/admin/events/'+event.id;
await ok('/api/admin/bili-role-config',{category_id:null,name:'审计专用分区',platform_id:null,staff_limit:1,verified:true,evidence_url:'https://example.test/audit',labels:['演唱']},'PUT');
const config=await ok('/api/form-config'),cat=config.categories.find(c=>c.name==='审计专用分区'),role=config.roles.find(r=>r.category_id===cat.id);
const draft=await ok('/api/submissions',{event_id:event.id,operation_id:randomUUID()});
const form={title:'审计已提交作品',type:'翻唱',description:'隔离测试资料',duration_seconds:60,category_id:cat.id,delivery_url:'',access_notes:'',notes:'',contact:{name:'测试甲',uid:'1001'},uploader:{name:'测试甲',uid:'1001'},contributors:[{name:'测试甲',uid:'1001',role_option_id:role.id,work_detail:''},{name:'测试乙',uid:'1002',role_option_id:role.id,work_detail:''}]};
const saved=await ok('/api/submissions/'+draft.id,{expectedVersion:1,form},'PATCH');
await ok('/api/submissions/'+draft.id+'/submit',{expectedVersion:saved.version,operation_id:randomUUID(),confirmed:true});
const drafts=await ok('/api/drafts'),detail=await ok('/api/submissions/'+draft.id);
results.push({id:'own-submissions',status:detail.submission.status,listed:drafts.some(d=>d.id===draft.id),detailAccessible:true});
results.push({id:'staff-limit',configuredLimit:cat.staff_limit,submittedContributors:detail.form.contributors.length,serverWarnings:detail.warnings??null});
const decimalPage=await req('/api/admin/submissions?event='+event.id+'&page=1.5');
results.push({id:'fractional-page',httpStatus:decimalPage.status,error:decimalPage.body.error});
let s=await ok(base+'/script');const item={id:randomUUID(),revision_id:null,custom_name:'审计临时节目',custom_type:'翻唱',custom_duration:60,notes:''};
await ok(base+'/program',{operation_id:randomUUID(),expectedVersion:s.program.version,starts_at:null,items:[item]},'PUT');s=await ok(base+'/script');
const b=s.blocks.find(b=>b.before_program_item_id===item.id),lid=randomUUID(),text='节目移除后仍需导出的主持文字';
await ok(base+'/script/operations',{type:'line.add',operation_id:randomUUID(),id:lid,block_id:b.id,expectedVersion:b.version,speaker_id:'builtin-chino',text,direction:''});s=await ok(base+'/script');
await ok(base+'/program',{operation_id:randomUUID(),expectedVersion:s.program.version,starts_at:null,items:[]},'PUT');
s=await ok(base+'/script');const exported=await req(base+'/script/export');
results.push({id:'orphan-export',lineRetainedInDatabase:s.lines.some(l=>l.id===lid&&l.text===text),orphan:true,exportHttpStatus:exported.status,exportContainsLine:exported.body.includes(text)});
// Prepare a program for the separate browser test; no real production content.
await ok(base+'/program',{operation_id:randomUUID(),expectedVersion:s.program.version,starts_at:null,items:[{...item,id:randomUUID(),custom_name:'保存竞态测试节目'}]},'PUT');
await writeFile('/private/tmp/usagi-functional-audit-fixture.json',JSON.stringify({cookie,eventId:event.id,base,email,uid:login.body.user.id,submissionId:draft.id,categoryId:cat.id}),{mode:0o600});
await writeFile('docs/audit/functional-probes-2026-10-05.json',JSON.stringify({scope:'local-only',date:'2026-10-05',results},null,2)+'\n');
console.log(JSON.stringify(results,null,2));
