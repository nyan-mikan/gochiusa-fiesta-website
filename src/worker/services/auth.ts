import type { Context } from 'hono';
import { z } from 'zod';
import { actor, AppError, atomic, cookie, first, guard, cleanup, hmac, id, now, parse, sessionHash, sha, sql, token } from './core';
import { sendMail } from './mail';
import {loginCodeEmail} from './auth-email';
import {LOGIN_CODE_TTL_SECONDS,SESSION_TTL_SECONDS} from './auth-policy';

export async function throttle(env:Env,scope:string,limit:number,seconds:number){
 const bucket=Math.floor(Date.now()/1000/seconds);const key=await hmac(env.AUTH_CODE_SECRET,scope);
 const r=await sql(env.DB,'INSERT INTO rate_limits(scope,bucket,count,expires_at) VALUES(?,?,1,?) ON CONFLICT(scope,bucket) DO UPDATE SET count=count+1 RETURNING count',key,bucket,new Date((bucket+1)*seconds*1000).toISOString()).first<{count:number}>();if((r?.count??0)>limit)throw new AppError(429,'操作太频繁，请稍后重试');
}
export function csrf(request:Request){
 const origin=request.headers.get('Origin');const own=new URL(request.url).origin;
 if(origin!==own || request.headers.get('X-Requested-With')!=='usagi')throw new AppError(403,'请求来源无效，请从本站操作');
}
export async function requestCode(c:Context<{Bindings:Env}>){
 const {email}=parse(z.object({email:z.string().email().max(254).transform(x=>x.trim().toLowerCase())}).strict(),await c.req.json());
 if(!c.env.AUTH_CODE_SECRET)throw new AppError(503,'认证服务未配置');
 await throttle(c.env,'auth-ip:'+ (c.req.header('CF-Connecting-IP')??'local'),20,3600);await throttle(c.env,'auth-email:'+email,1,60);await throttle(c.env,'auth-email-hour:'+email,6,3600);
 let random=crypto.getRandomValues(new Uint32Array(1))[0];while(random>=4294000000)random=crypto.getRandomValues(new Uint32Array(1))[0];const code=String(random%1000000).padStart(6,'0');const challenge=id();const created=now();
 await sql(c.env.DB,'INSERT INTO auth_challenges(id,email,code_hash,expires_at,created_at) VALUES(?,?,?,?,?)',challenge,email,await hmac(c.env.AUTH_CODE_SECRET,challenge+':'+code),new Date(Date.parse(created)+LOGIN_CODE_TTL_SECONDS*1000).toISOString(),created).run();
 try{await sendMail(c.env,{to:email,subject:'点兔贺年祭 · 登录验证码',...loginCodeEmail(code,LOGIN_CODE_TTL_SECONDS/60),key:'auth:'+challenge});}
 catch(error){await sql(c.env.DB,'UPDATE auth_challenges SET used_at=? WHERE id=?',now(),challenge).run();throw error;}
 return c.json({challenge_id:challenge,message:'验证码已发送，请检查邮箱'});
}
export async function verifyCode(c:Context<{Bindings:Env}>){
 const data=parse(z.object({challenge_id:z.string().uuid(),code:z.string().regex(/^\d{6}$/)}).strict(),await c.req.json());
 await throttle(c.env,'verify-ip:'+(c.req.header('CF-Connecting-IP')??'local'),40,600);
 const challenge=await first<{id:string;email:string;code_hash:string;expires_at:string;attempts:number;used_at:string|null}>(c.env.DB,'SELECT * FROM auth_challenges WHERE id=?',data.challenge_id);
 if(!challenge || challenge.used_at || challenge.expires_at<=now() || challenge.attempts>=5)throw new AppError(422,'验证码无效或已过期');
 const hashed=await hmac(c.env.AUTH_CODE_SECRET,challenge.id+':'+data.code);
 const verifyKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(c.env.AUTH_CODE_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);const signature=Uint8Array.from(challenge.code_hash.match(/.{2}/g)??[],x=>parseInt(x,16));
 if(!await crypto.subtle.verify('HMAC',verifyKey,signature,new TextEncoder().encode(challenge.id+':'+data.code))){await sql(c.env.DB,'UPDATE auth_challenges SET attempts=MIN(attempts+1,5) WHERE id=?',challenge.id).run();throw new AppError(422,'验证码无效或已过期');}
 const key=id(),uid=id(),session=token(),hash=await sha(session),time=now();
 await atomic(c.env.DB,[
  guard(c.env.DB,key,'EXISTS(SELECT 1 FROM auth_challenges WHERE id=? AND used_at IS NULL AND expires_at>? AND attempts<5 AND code_hash=?)',challenge.id,time,hashed),
  sql(c.env.DB,'UPDATE auth_challenges SET used_at=? WHERE id=?',time,challenge.id),
  sql(c.env.DB,"INSERT INTO users(id,email,verified_at,created_at) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET verified_at=COALESCE(users.verified_at,excluded.verified_at)",uid,challenge.email,time,time),
  guard(c.env.DB,key+'-user','EXISTS(SELECT 1 FROM users WHERE email=? AND disabled_at IS NULL)',challenge.email),
  sql(c.env.DB,'INSERT INTO sessions SELECT ?,id,?,NULL,? FROM users WHERE email=?',hash,new Date(Date.parse(time)+SESSION_TTL_SECONDS*1000).toISOString(),time,challenge.email),cleanup(c.env.DB,key),cleanup(c.env.DB,key+'-user')
 ]);
 const secure=c.env.ENVIRONMENT!=='development';c.header('Set-Cookie',`usagi_session=${session}; Path=/; HttpOnly; ${secure?'Secure; ':''}SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`);
 return c.json({user:await actor(c.env,hash)});
}
export async function logout(c:Context<{Bindings:Env}>){await sql(c.env.DB,'UPDATE sessions SET revoked_at=? WHERE token_hash=?',now(),await sessionHash(c.req.raw)).run();c.header('Set-Cookie',`usagi_session=; Path=/; HttpOnly; ${c.env.ENVIRONMENT!=='development'?'Secure; ':''}SameSite=Lax; Max-Age=0`);return c.json({ok:true});}
