import type {Context} from 'hono';
import {z} from 'zod';
import {actor,AppError,atomic,audit,cleanup,first,guard,hmac,id,now,parse,sha,sql,token} from './core';
import {throttle} from './auth';
import {sendMail} from './mail';
import {LOGIN_CODE_TTL_SECONDS,SESSION_TTL_SECONDS} from './auth-policy';
import type {User} from '../../shared/models';
type C=Context<{Bindings:Env;Variables:{user:User;hash:string}}>;
type Key={id:string;public_key:string;fingerprint:string;created_at:string};
type Challenge={id:string;key_id:string;message:string;expires_at:string;attempts:number;used_at:string|null};
const algorithm={name:'ECDSA',namedCurve:'P-256'};
const signatureSchema=z.string().max(100).regex(/^[A-Za-z0-9+/]+={0,2}$/);
const bytes=(value:string)=>Uint8Array.from(atob(value),x=>x.charCodeAt(0));
const base64=(value:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(value)));
const invalid=()=>new AppError(422,'验证无效或已过期，请重新操作');
async function publicKey(value:string){
 try{const key=await crypto.subtle.importKey('spki',bytes(value),algorithm,true,['verify']);
  // Canonical encoding prevents the same public key being enrolled with a different encoding.
  if(base64(await crypto.subtle.exportKey('spki',key))!==value)throw invalid();return key;
 }catch{throw new AppError(422,'公钥格式无效');}
}
async function verify(key:CryptoKey,signature:string,message:string){try{return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,bytes(signature),new TextEncoder().encode(message));}catch{return false;}}
function message(c:C,purpose:string,challenge:string,key:string){return `Gochiusa New Year Fiesta\n${purpose}\n${new URL(c.req.url).origin}\n${challenge}\n${key}\n${token()}`;}
function ip(c:C){return c.req.header('CF-Connecting-IP')??'local';}
export async function keyStatus(c:C){return c.json({key:await first<Key>(c.env.DB,'SELECT id,fingerprint,created_at FROM account_login_keys WHERE user_id=? AND revoked_at IS NULL',c.get('user').id)});}
export async function requestKeyCode(c:C){
 parse(z.object({}).strict(),await c.req.json());const user=c.get('user'),time=now();
 await throttle(c.env,'key-issue-ip:'+ip(c),20,3600);await throttle(c.env,'key-issue-user:'+user.id,6,3600);
 const last=await first<{created_at:string}>(c.env.DB,'SELECT created_at FROM key_email_challenges WHERE user_id=? ORDER BY created_at DESC LIMIT 1',user.id);
 if(last&&Date.parse(time)-Date.parse(last.created_at)<60000)throw new AppError(429,'请等待 60 秒后再发送验证码');
 const previous=await first<{id:string}>(c.env.DB,'SELECT id FROM account_login_keys WHERE user_id=? AND revoked_at IS NULL',user.id);
 let random=crypto.getRandomValues(new Uint32Array(1))[0];while(random>=4294000000)random=crypto.getRandomValues(new Uint32Array(1))[0];
 const code=String(random%1000000).padStart(6,'0'),challenge=id(),key=id(),proof=message(c,'enroll-private-key',challenge,key),assertion=id();
 await atomic(c.env.DB,[
  guard(c.env.DB,assertion,'NOT EXISTS(SELECT 1 FROM key_email_challenges WHERE user_id=? AND created_at>?)',user.id,new Date(Date.parse(time)-60000).toISOString()),
  sql(c.env.DB,'UPDATE key_email_challenges SET used_at=? WHERE user_id=? AND used_at IS NULL',time,user.id),
  sql(c.env.DB,'INSERT INTO key_email_challenges(id,user_id,session_hash,key_id,expected_key_id,message,code_hash,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)',challenge,user.id,c.get('hash'),key,previous?.id??'',proof,await hmac(c.env.AUTH_CODE_SECRET,'key-issue:'+challenge+':'+code),new Date(Date.parse(time)+LOGIN_CODE_TTL_SECONDS*1000).toISOString(),time),cleanup(c.env.DB,assertion)
 ]);
 try{await sendMail(c.env,{to:user.email,subject:'点兔贺年祭 · 私钥生成验证码',text:`你正在生成新的登录私钥。\n验证码：${code}\n10 分钟内有效。生成成功后，旧私钥将失效。请勿将验证码或私钥分享给他人。\n如果不是你本人操作，请忽略此邮件。`,key:'key-issue:'+challenge});}
 catch(error){await sql(c.env.DB,'UPDATE key_email_challenges SET used_at=? WHERE id=?',now(),challenge).run();throw error;}
 return c.json({challenge_id:challenge,key_id:key,message:proof});
}
export async function registerKey(c:C){
 const data=parse(z.object({challenge_id:z.string().uuid(),code:z.string().regex(/^\d{6}$/),public_key:z.string().max(180).regex(/^[A-Za-z0-9+/]+={0,2}$/),signature:signatureSchema}).strict(),await c.req.json());
 const user=c.get('user'),hash=c.get('hash');await throttle(c.env,'key-issue-verify:'+ip(c),40,600);
 const challenge=await first<Challenge&{user_id:string;session_hash:string;expected_key_id:string;code_hash:string}>(c.env.DB,'SELECT * FROM key_email_challenges WHERE id=?',data.challenge_id);
 if(!challenge||challenge.user_id!==user.id||challenge.session_hash!==hash||challenge.used_at||challenge.expires_at<=now()||challenge.attempts>=5)throw invalid();
 const mac=await crypto.subtle.importKey('raw',new TextEncoder().encode(c.env.AUTH_CODE_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const validCode=await crypto.subtle.verify('HMAC',mac,Uint8Array.from(challenge.code_hash.match(/.{2}/g)??[],x=>parseInt(x,16)),new TextEncoder().encode('key-issue:'+challenge.id+':'+data.code));
 let validProof=false;if(validCode)validProof=await verify(await publicKey(data.public_key),data.signature,challenge.message);
 if(!validCode||!validProof){await sql(c.env.DB,'UPDATE key_email_challenges SET attempts=MIN(attempts+1,5) WHERE id=?',challenge.id).run();throw invalid();}
 const time=now(),assertion=id(),fingerprint=await sha(data.public_key);
 await atomic(c.env.DB,[
  guard(c.env.DB,assertion,'EXISTS(SELECT 1 FROM key_email_challenges WHERE id=? AND user_id=? AND session_hash=? AND used_at IS NULL AND expires_at>? AND attempts<5) AND EXISTS(SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.user_id=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.disabled_at IS NULL) AND COALESCE((SELECT id FROM account_login_keys WHERE user_id=? AND revoked_at IS NULL),\'\')=?',challenge.id,user.id,hash,time,hash,user.id,time,user.id,challenge.expected_key_id),
  sql(c.env.DB,'UPDATE key_email_challenges SET used_at=? WHERE id=?',time,challenge.id),
  sql(c.env.DB,'UPDATE account_login_keys SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL',time,user.id),
  sql(c.env.DB,'UPDATE sessions SET revoked_at=? WHERE token_hash<>? AND token_hash IN(SELECT ks.token_hash FROM key_sessions ks JOIN account_login_keys k ON k.id=ks.key_id WHERE k.user_id=?) AND revoked_at IS NULL',time,hash,user.id),
  // Fresh mailbox verification retains the current session even when it used the old key.
  sql(c.env.DB,'DELETE FROM key_sessions WHERE token_hash=?',hash),
  sql(c.env.DB,'INSERT INTO account_login_keys(id,user_id,public_key,fingerprint,created_at) VALUES(?,?,?,?,?)',challenge.key_id,user.id,data.public_key,fingerprint,time),
  audit(c.env.DB,user,'account_login_key',challenge.key_id,challenge.expected_key_id?'rotate':'create',{previous_key_id:challenge.expected_key_id||null}),cleanup(c.env.DB,assertion)
 ]);
 return c.json({key:{id:challenge.key_id,fingerprint,created_at:time}});
}
export async function requestKeyLogin(c:C){
 const data=parse(z.object({key_id:z.string().uuid()}).strict(),await c.req.json());
 await throttle(c.env,'key-login-ip:'+ip(c),40,600);await throttle(c.env,'key-login-key:'+data.key_id,20,600);
 const challenge=id(),time=now(),proof=message(c,'login-private-key',challenge,data.key_id);
 const key=await first<{id:string}>(c.env.DB,'SELECT k.id FROM account_login_keys k JOIN users u ON u.id=k.user_id WHERE k.id=? AND k.revoked_at IS NULL AND u.disabled_at IS NULL',data.key_id);
 if(key)await sql(c.env.DB,'INSERT INTO login_key_challenges(id,key_id,message,ip_hash,expires_at,created_at) VALUES(?,?,?,?,?,?)',challenge,key.id,proof,await hmac(c.env.AUTH_CODE_SECRET,'key-ip:'+ip(c)),new Date(Date.parse(time)+120000).toISOString(),time).run();
 // Unknown, revoked and disabled keys have the same public response.
 return c.json({challenge_id:challenge,message:proof});
}
export async function verifyKeyLogin(c:C){
 const data=parse(z.object({challenge_id:z.string().uuid(),signature:signatureSchema}).strict(),await c.req.json());
 await throttle(c.env,'key-login-verify:'+ip(c),40,600);
 const challenge=await first<Challenge&{public_key:string;ip_hash:string}>(c.env.DB,'SELECT c.*,k.public_key FROM login_key_challenges c JOIN account_login_keys k ON k.id=c.key_id JOIN users u ON u.id=k.user_id WHERE c.id=? AND k.revoked_at IS NULL AND u.disabled_at IS NULL',data.challenge_id);
 if(!challenge||challenge.used_at||challenge.expires_at<=now()||challenge.attempts>=5||challenge.ip_hash!==await hmac(c.env.AUTH_CODE_SECRET,'key-ip:'+ip(c)))throw invalid();
 if(!await verify(await publicKey(challenge.public_key),data.signature,challenge.message)){await sql(c.env.DB,'UPDATE login_key_challenges SET attempts=MIN(attempts+1,5) WHERE id=?',challenge.id).run();throw invalid();}
 const session=token(),hash=await sha(session),time=now(),assertion=id();
 await atomic(c.env.DB,[
  guard(c.env.DB,assertion,'EXISTS(SELECT 1 FROM login_key_challenges c JOIN account_login_keys k ON k.id=c.key_id JOIN users u ON u.id=k.user_id WHERE c.id=? AND c.used_at IS NULL AND c.expires_at>? AND c.attempts<5 AND k.revoked_at IS NULL AND u.disabled_at IS NULL)',challenge.id,time),
  sql(c.env.DB,'UPDATE login_key_challenges SET used_at=? WHERE id=?',time,challenge.id),
  sql(c.env.DB,'INSERT INTO sessions(token_hash,user_id,expires_at,created_at) SELECT ?,user_id,?,? FROM account_login_keys WHERE id=?',hash,new Date(Date.parse(time)+SESSION_TTL_SECONDS*1000).toISOString(),time,challenge.key_id),
  sql(c.env.DB,'INSERT INTO key_sessions(token_hash,key_id) VALUES(?,?)',hash,challenge.key_id),cleanup(c.env.DB,assertion)
 ]);
 c.header('Set-Cookie',`usagi_session=${session}; Path=/; HttpOnly; ${c.env.ENVIRONMENT!=='development'?'Secure; ':''}SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`);
 return c.json({user:await actor(c.env,hash)});
}
