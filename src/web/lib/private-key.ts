const algorithm={name:'ECDSA',namedCurve:'P-256'};
const base64=(value:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(value)));
const bytes=(value:string)=>Uint8Array.from(atob(value),x=>x.charCodeAt(0));
export type KeyChallenge={challenge_id:string;key_id?:string;message:string};
export type KeyInfo={id:string;fingerprint:string;created_at:string};
export function checkChallenge(challenge:KeyChallenge,purpose:'enroll-private-key'|'login-private-key',keyId:string){
 const parts=challenge.message.split('\n');
 if(parts.length!==6||parts[0]!=='Gochiusa New Year Fiesta'||parts[1]!==purpose||parts[2]!==location.origin||parts[3]!==challenge.challenge_id||parts[4]!==keyId||!/^[a-f0-9]{64}$/.test(parts[5]!))throw new Error('登录验证信息无效，请刷新页面后重试');
}
export async function sign(key:CryptoKey,message:string){return base64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(message)));}
export async function generateLoginKey(challenge:KeyChallenge){
 if(!challenge.key_id)throw new Error('生成验证信息无效');checkChallenge(challenge,'enroll-private-key',challenge.key_id);
 const pair=await crypto.subtle.generateKey(algorithm,true,['sign','verify']);
 const publicKey=base64(await crypto.subtle.exportKey('spki',pair.publicKey));
 const privateKey=base64(await crypto.subtle.exportKey('pkcs8',pair.privateKey));
 return {publicKey,signature:await sign(pair.privateKey,challenge.message),file:JSON.stringify({format:'gochiusa-fiesta-private-key',version:1,key_id:challenge.key_id,private_key:privateKey},null,2)+'\n'};
}
export async function readLoginKey(file:File){
 if(file.size>4096)throw new Error('私钥文件过大，请选择本站生成的 JSON 文件');
 try{
  const value:unknown=JSON.parse(await file.text());
  if(!value||typeof value!=='object')throw new Error();
  const v=value as Record<string,unknown>;
  if(Object.keys(v).sort().join(',')!=='format,key_id,private_key,version'||v.format!=='gochiusa-fiesta-private-key'||v.version!==1||typeof v.key_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.key_id)||typeof v.private_key!=='string'||v.private_key.length>512)throw new Error();
  const key=await crypto.subtle.importKey('pkcs8',bytes(v.private_key),algorithm,false,['sign']);return {keyId:v.key_id,key};
 }catch{throw new Error('私钥文件无效，请选择本站下载的 JSON 文件。丢失私钥可改用邮箱登录。');}
}
