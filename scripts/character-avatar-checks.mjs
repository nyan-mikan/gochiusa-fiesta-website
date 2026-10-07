import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {avatarPng} from './character-avatar-fixture.mjs';

export async function characterAvatarChecks({request,base,adminCookie,ownerCookie,origin}){
 const operations=base+'/characters/operations',eventId=base.split('/').at(-1),id=randomUUID(),png=avatarPng(),avatar={content_type:'image/png',data:png.toString('base64')};
 const call=(data,status=200,cookie=adminCookie)=>request(operations,data,cookie,'POST',status);
 const read=async id=>(await request(base+'/characters',undefined,adminCookie)).v.characters.find(c=>c.id===id);
 const add=(id,extra={})=>({operation_id:randomUUID(),type:'character.add',id,name:'头像验证 '+id.slice(0,8),color:'#80636f',list_id:null,...extra});
 const update=(version,extra={})=>({operation_id:randomUUID(),type:'character.update',id,expectedVersion:version,name:'头像验证',color:'#80636f',archived:false,...extra});
 const plain=randomUUID();await call(add(plain));assert.equal((await read(plain)).avatar_url,undefined,'portrait remains optional');
 const create=add(id,{avatar}),ack=await call(create);assert.deepEqual((await call(create)).v,ack.v);let character=await read(id);assert.equal(character.version,1);let url=character.avatar_url;assert.match(url,/^\/api\/character-avatars\//);assert.ok(!JSON.stringify(character).includes(avatar.data));
 const photo=await request(url,undefined,adminCookie);assert.equal(photo.r.headers.get('content-type'),'image/png');assert.equal(photo.r.headers.get('cache-control'),'no-store');
 const bytes=await fetch(origin+url,{headers:{Cookie:adminCookie}});assert.deepEqual(Buffer.from(await bytes.arrayBuffer()),png);
 await request(url,undefined,'','GET',401);await request(url,undefined,ownerCookie,'GET',403);await request(url.replace(eventId,'wrong-event'),undefined,adminCookie,'GET',404);
 await call({...create,operation_id:randomUUID()},409);assert.equal((await read(id)).avatar_url,url,'duplicate identity cannot damage the existing portrait');
 const invalidId=randomUUID();for(const invalid of [{content_type:'image/svg+xml',data:Buffer.from('<svg/>').toString('base64')},{content_type:'image/png',data:Buffer.from('not a PNG').toString('base64')},{content_type:'image/jpeg',data:avatar.data},{content_type:'image/png',data:'invalid base64'}])await call(add(invalidId,{avatar:invalid}),422);
 const tooWide=Buffer.from(png);tooWide.writeUInt32BE(513,16);await call(add(invalidId,{avatar:{content_type:'image/png',data:tooWide.toString('base64')}}),422);assert.equal(await read(invalidId),undefined);
 await call(add(randomUUID(),{avatar}),403,ownerCookie);
 const failedId=randomUUID();await call(add(failedId,{avatar,list_id:'nonexistent-list'}),409);assert.equal(await read(failedId),undefined,'failed creation leaves no character or image reference');const digest=createHash('sha256').update(png).digest('hex');await request('/api/character-avatars/'+eventId+'/'+failedId+'/'+digest,undefined,adminCookie,'GET',404);
 await call(update(1));character=await read(id);assert.equal(character.avatar_url,url,'ordinary editing preserves the avatar');
 const replacement={content_type:'image/png',data:avatarPng(224).toString('base64')},replace=update(2,{avatar:replacement});const replaced=await call(replace);assert.deepEqual((await call(replace)).v,replaced.v);character=await read(id);assert.notEqual(character.avatar_url,url);await request(url,undefined,adminCookie,'GET',404);url=character.avatar_url;
 await call(update(2,{avatar:null}),409);assert.equal((await read(id)).avatar_url,url,'stale removal cannot erase the winning portrait');
 const attempts=await Promise.all([null,avatar].map(value=>call(update(3,{avatar:value}),[200,409])));assert.equal(attempts.filter(r=>r.r.status===200).length,1);assert.equal(attempts.filter(r=>r.r.status===409).length,1);character=await read(id);assert.equal(character.version,4);
 await call(update(4,{avatar:null}));assert.equal((await read(id)).avatar_url,undefined);await request(url,undefined,adminCookie,'GET',404);
 console.log('PASS: optional avatar creation/persistence, actual private R2 bytes and image MIME, idempotency, authentication/module access, event isolation, invalid/SVG/mismatched/oversized-dimension rejection, atomic create failure, preserved avatars on normal edits, replacement and old-image invalidation, stale and concurrent changes, and removal.');
}
