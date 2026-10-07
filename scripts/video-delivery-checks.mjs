import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {videoFixture,videoMp4} from './video-fixture.mjs';

export async function videoDeliveryChecks({request,origin,event,form,owner,admin,other,localSql}){
 const draft=async(eventId=event.id)=>{const v=(await request('/api/submissions',{event_id:eventId,operation_id:randomUUID()},owner.cookie,'POST',201)).v;return '/api/submissions/'+v.id;};
 const upload=async(path,data=videoMp4(),filename='视频.mp4',content_type='video/mp4',expected=200)=>{
  const task=(await request(path+'/uploads',{filename,size:data.length,content_type},owner.cookie,'POST',201)).v;
  const r=await fetch(origin+'/api/uploads/'+task.id+'/parts/1',{method:'PUT',headers:{Cookie:owner.cookie,Origin:origin,'X-Requested-With':'usagi','Content-Type':'application/octet-stream'},body:data});assert.equal(r.status,200);
  await request('/api/uploads/'+task.id+'/complete',{},owner.cookie,'POST',expected);return task.id;
 };
 const path=await draft();
 for(const [filename,content_type] of [['作品.mp3','audio/mpeg'],['图片.png','image/png'],['作品.zip','application/zip'],['伪装.mp4','audio/mp4'],['脚本.html','text/html']])await request(path+'/uploads',{filename,size:100,content_type},owner.cookie,'POST',422);
 for(const data of [Buffer.from('<html>not video</html>'),videoFixture('silent.m4a'),videoMp4().subarray(0,25)]){
  const uid=await upload(path,data,'伪装.mp4','video/mp4',422);await request('/api/uploads/'+uid+'/download',undefined,owner.cookie,'GET',404);
  await request(path,{expectedVersion:1,form:{...form,upload_id:uid}},owner.cookie,'PATCH',422);
 }
 for(const [data,filename,type] of [[videoFixture('silent.webm'),'音频.webm','video/webm'],[videoFixture('black.mp4'),'错配.webm','video/webm'],[videoFixture('black.webm'),'错配.mp4','video/mp4']])await upload(path,data,filename,type,422);
 for(const [filename,content_type,source] of [['视频.mov','video/quicktime','black.mov'],['视频.webm','video/webm','black.webm'],['视频.mkv','application/octet-stream','black.mkv'],['视频.m4v','video/x-m4v','black.mp4']])await upload(path,videoFixture(source),filename,content_type);
 await request(path,{expectedVersion:1,form},owner.cookie,'PATCH');
 await request(path+'/submit',{expectedVersion:2,confirmed:true,operation_id:randomUUID()},owner.cookie);
 const frozen=(await request(path,undefined,owner.cookie)).v;assert.equal(frozen.uploaded_file,null);
 const uid=await upload(path),otherUid=await upload(path),foreign=await draft(),foreignUid=await upload(foreign);
 const op={expectedVersion:frozen.submission.version,expectedRevision:frozen.revision.id,upload_id:uid,operation_id:randomUUID()};
 await request(path+'/delivery',op,'','POST',401);await request(path+'/delivery',op,other.cookie,'POST',404);await request(path+'/delivery',op,admin.cookie,'POST',403);
 await request(path+'/delivery',{...op,upload_id:foreignUid},owner.cookie,'POST',422);
 await request(path+'/delivery',{...op,upload_id:randomUUID()},owner.cookie,'POST',422);
 await request(path+'/delivery',{...op,expectedRevision:randomUUID()},owner.cookie,'POST',409);
 await request(path+'/delivery',{...op,expectedVersion:op.expectedVersion-1},owner.cookie,'POST',409);
 // Both editors see no attachment. Only one can commit; the loser rolls back.
 const secondOp={...op,upload_id:otherUid,operation_id:randomUUID()};const outcomes=await Promise.all([request(path+'/delivery',op,owner.cookie,'POST',[200,409]),request(path+'/delivery',secondOp,owner.cookie,'POST',[200,409])]);
 assert.deepEqual(outcomes.map(x=>x.r.status).sort(),[200,409]);
 const chosen=outcomes[0].r.status===200?op:secondOp;
 await request(path+'/delivery',chosen,owner.cookie);await request(path+'/delivery',{...chosen,upload_id:foreignUid},owner.cookie,'POST',409);
 const current=(await request(path,undefined,owner.cookie)).v;assert.equal(current.uploaded_file.id,chosen.upload_id);assert.ok(current.delivery_at);assert.equal((await request('/api/submissions?event='+event.id,undefined,owner.cookie)).v.items.find(x=>x.id===current.submission.id).delivered,1);
 assert.deepEqual(current.revision,frozen.revision);assert.deepEqual(current.revisions,frozen.revisions);assert.deepEqual(current.reviews,frozen.reviews);assert.equal(current.submission.status,'pending');assert.equal(current.submission.version,frozen.submission.version+1);
 assert.deepEqual({...current.form,upload_id:null},frozen.form);
 assert.equal((await request(path+'?revision='+frozen.revision.id,undefined,admin.cookie)).v.uploaded_file.id,chosen.upload_id);
 await request(path+'/uploads',{filename:'替换.mp4',size:100,content_type:'video/mp4'},owner.cookie,'POST',409);
 await request(path,{expectedVersion:current.submission.version,form:{...form,title:'覆盖'}},owner.cookie,'PATCH',409);
 const rid=frozen.revision.id;
 for(const query of [`UPDATE revision_deliveries SET upload_id='${foreignUid}' WHERE revision_id='${rid}'`,`DELETE FROM revision_deliveries WHERE revision_id='${rid}'`,`UPDATE submission_revisions SET title='覆盖' WHERE id='${rid}'`])assert.throws(()=>localSql(query));
 // Cleanup must retain supplementary deliveries even after their upload expires.
 const orphan=chosen.upload_id===uid?otherUid:uid;localSql(`UPDATE uploads SET expires_at='2000-01-01T00:00:00.000Z' WHERE id IN('${chosen.upload_id}','${orphan}')`);
 let cleaned=false;for(let i=0;i<10;i++){await fetch(origin+'/cdn-cgi/handler/scheduled');await new Promise(r=>setTimeout(r,100));const row=localSql(`SELECT COUNT(*) n FROM uploads WHERE id='${orphan}'`)[0].results[0];if(row.n===0){cleaned=true;break;}}assert.equal(cleaned,true,'scheduled cleanup removes the unreferenced expired file');await request('/api/uploads/'+chosen.upload_id+'/download',undefined,owner.cookie);
 assert.equal(localSql(`SELECT COUNT(*) n FROM revision_deliveries WHERE revision_id='${rid}'`)[0].results[0].n,1);
 // Approval can precede delivery; closure of the original call for entries does not prevent delivery.
 const lateEvent=(await request('/api/admin/events',{name:'补交窗口测试',year:2027,timezone:'Asia/Shanghai',opens_at:null,closes_at:null,submissions_open:true,active:true,wishes_open:false},admin.cookie)).v;
 const approvedPath=await draft(lateEvent.id);await request(approvedPath,{expectedVersion:1,form},owner.cookie,'PATCH');await request(approvedPath+'/submit',{expectedVersion:2,confirmed:true,operation_id:randomUUID()},owner.cookie);
 let approved=(await request(approvedPath,undefined,owner.cookie)).v;
 await request('/api/admin/submissions/'+approved.submission.id+'/reviews',{expectedVersion:approved.submission.version,expectedRevision:approved.revision.id,decision:'approved',operation_id:randomUUID()},admin.cookie);
 approved=(await request(approvedPath,undefined,owner.cookie)).v;localSql(`UPDATE events SET submissions_open=0,closes_at='2000-01-01T00:00:00.000Z' WHERE id='${lateEvent.id}'`);const aid=await upload(approvedPath);
 // A review using the pre-delivery version cannot silently overlook the new video.
 await request(approvedPath+'/delivery',{expectedVersion:approved.submission.version,expectedRevision:approved.revision.id,upload_id:aid,operation_id:randomUUID()},owner.cookie);
 const after=(await request(approvedPath,undefined,owner.cookie)).v;assert.equal(after.submission.status,'approved');assert.deepEqual(after.reviews,approved.reviews);assert.deepEqual(after.revision,approved.revision);
 await request('/api/admin/submissions/'+after.submission.id+'/reopen',{expectedVersion:approved.submission.version,expectedRevision:approved.revision.id,reason:'旧页面',operation_id:randomUUID()},admin.cookie,'POST',409);
 await request('/api/admin/submissions/'+after.submission.id+'/reopen',{expectedVersion:after.submission.version,expectedRevision:after.revision.id,reason:'重新检查',operation_id:randomUUID()},admin.cookie);
 await request(approvedPath+'/delivery',{expectedVersion:after.submission.version+1,expectedRevision:after.revision.id,upload_id:aid,operation_id:randomUUID()},owner.cookie,'POST',409);
 // Returned submissions create a fresh revision; old delivery and approval stay readable.
 const returned=(await request(approvedPath,undefined,owner.cookie)).v;await request(approvedPath,{expectedVersion:returned.submission.version,form:returned.form},owner.cookie,'PATCH');
 const copy=(await request(approvedPath,undefined,owner.cookie)).v;assert.notEqual(copy.revision.id,after.revision.id);assert.equal(copy.uploaded_file.id,aid);
 assert.equal((await request(approvedPath+'?revision='+after.revision.id,undefined,admin.cookie)).v.uploaded_file.id,aid);
 await request(foreign+'/delivery',{expectedVersion:1,expectedRevision:(await request(foreign,undefined,owner.cookie)).v.revision.id,upload_id:foreignUid,operation_id:randomUUID()},owner.cookie,'POST',409);
 const legacyPath=await draft(),legacyUid=await upload(legacyPath);await request(legacyPath,{expectedVersion:1,form:{...form,upload_id:legacyUid}},owner.cookie,'PATCH');localSql(`DELETE FROM upload_videos WHERE upload_id='${legacyUid}'`);await request(legacyPath+'/submit',{expectedVersion:2,confirmed:true,operation_id:randomUUID()},owner.cookie);assert.equal((await request(legacyPath,undefined,owner.cookie)).v.uploaded_file.id,legacyUid);assert.equal(localSql(`SELECT COUNT(*) n FROM upload_videos WHERE upload_id='${legacyUid}'`)[0].results[0].n,1,'existing video checked on new submit without bulk historical backfill');
 console.log('PASS: real MP4/MOV/WebM/MKV, forged/audio/truncated rejection, video-only delivery, submit without media, pending/approved supplementation, ownership, immutable revisions, atomic races, idempotency, historical downloads and cleanup protection.');
}
