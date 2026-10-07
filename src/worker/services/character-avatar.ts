import type {CharacterAvatarInput} from '../../shared/character-avatar';
import {AVATAR_SOURCE,MAX_AVATAR_SIZE,imageDimensions} from '../../shared/character-avatar';
import type {User} from '../../shared/models';
import {requireModule} from './module-access';
import {AppError,first,now,sql} from './core';

const pathPattern=/^\/api\/character-avatars\/([^/]+)\/([^/]+)\/([a-f0-9]{64})$/;
export function avatarKey(url:string){const match=pathPattern.exec(url);return match?'character-avatars/'+match[1]+'/'+match[2]+'/'+match[3]:null;}
export async function prepareAvatar(env:Env,user:User,eventId:string,characterId:string,input:CharacterAvatarInput){
 if(!env.UPLOADS)throw new AppError(503,'头像存储暂时不可用');
 let binary:string;try{binary=atob(input.data);}catch{throw new AppError(422,'头像文件无效');}
 if(btoa(binary)!==input.data||binary.length>MAX_AVATAR_SIZE)throw new AppError(422,'头像文件过大或格式无效');
 const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),dimensions=imageDimensions(bytes,input.content_type);
 if(!dimensions||dimensions.some(n=>n<1||n>512))throw new AppError(422,'头像必须是有效的 PNG、JPEG 或 WebP 图片，宽高最多 512 像素');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const url='/api/character-avatars/'+encodeURIComponent(eventId)+'/'+encodeURIComponent(characterId)+'/'+digest,key=avatarKey(url);
 if(!key)throw new AppError(422,'角色编号格式无效');
 // Content-addressed immutable objects cannot overwrite another editor's portrait.
 await env.UPLOADS.put(key,bytes,{httpMetadata:{contentType:input.content_type},customMetadata:{event_id:eventId,character_id:characterId,uploaded_by:user.id}});
 return {url,key,statement:sql(env.DB,'INSERT INTO character_sources(character_id,url,checked_at,verification) VALUES(?,?,?,?)',characterId,url,now(),AVATAR_SOURCE)};
}
export async function storedAvatar(env:Env,characterId:string){return first<{url:string}>(env.DB,'SELECT url FROM character_sources WHERE character_id=? AND verification=?',characterId,AVATAR_SOURCE);}
export async function discardAvatar(env:Env,url:string){const key=avatarKey(url);if(key)try{await env.UPLOADS.delete(key);}catch{console.warn(JSON.stringify({event:'character_avatar_cleanup_failed'}));}}
export async function characterAvatar(env:Env,user:User,eventId:string,characterId:string,digest:string){
 requireModule(user,'collaboration');
 if(!/^[a-f0-9]{64}$/.test(digest))throw new AppError(404,'头像不存在');
 const url='/api/character-avatars/'+encodeURIComponent(eventId)+'/'+encodeURIComponent(characterId)+'/'+digest;
 if(!await first(env.DB,'SELECT 1 FROM character_sources s JOIN characters c ON c.id=s.character_id WHERE c.event_id=? AND s.character_id=? AND s.url=? AND s.verification=?',eventId,characterId,url,AVATAR_SOURCE))throw new AppError(404,'头像不存在');
 const object=await env.UPLOADS.get(avatarKey(url)!);if(!object)throw new AppError(404,'头像不存在');
 return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType??'application/octet-stream','Content-Length':String(object.size),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
