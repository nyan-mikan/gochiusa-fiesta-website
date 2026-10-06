import {z} from 'zod';
import {actor,atomic,audit,cleanup,guard,id,now,parse,sql} from './core';
import type {User} from '../../shared/models';
export async function updateNickname(env:Env,user:User,hash:string,input:unknown){
 const v=parse(z.object({nickname:z.string().trim().transform(x=>x.normalize('NFC')).pipe(z.string().max(40).regex(/^[^\u0000-\u001f\u007f-\u009f\u2028\u2029]*$/,'昵称不能包含换行或控制字符'))}).strict(),input),key=id();
 await atomic(env.DB,[guard(env.DB,key,'EXISTS(SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.user_id=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.disabled_at IS NULL)',hash,user.id,now()),sql(env.DB,'UPDATE users SET nickname=? WHERE id=?',v.nickname,user.id),audit(env.DB,user,'user',user.id,'nickname.update',{}),cleanup(env.DB,key)]);
 return {user:await actor(env,hash)};
}
