import { all, first, id, now, sql, AppError } from './core';
import nodemailer from 'nodemailer';
import { connect as connectTls, type TLSSocket } from 'node:tls';
import {smtpDiagnostic} from './mail-diagnostics';

export async function sendMail(env:Env,message:{to:string;subject:string;text:string;html?:string;key:string}){
 if(String(env.MAIL_PROVIDER)==='smtp' && env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.MAIL_FROM){
  const host=env.SMTP_HOST;
  const transport=nodemailer.createTransport({host,port:465,secure:true,name:'usagi.mikanyan.com',auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,dnsTimeout:10000,disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false,
   // Let Workers resolve the hostname for its outbound TLS socket. A Node DNS
   // lookup followed by an IP connection can pick an unreachable SMTP address.
   getSocket(_options:unknown,callback:(error:Error|null,options?:{connection:TLSSocket;secured:true})=>void){
    const connection=connectTls({host,port:465,servername:host,rejectUnauthorized:true});
    const timer=setTimeout(()=>connection.destroy(new Error('SMTP connection timeout')),10000);
    const failed=(error:Error)=>{clearTimeout(timer);callback(error);};
    connection.once('error',failed);
    connection.once('secureConnect',()=>{clearTimeout(timer);connection.removeListener('error',failed);callback(null,{connection,secured:true});});
   }
  });
  try{
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(message.key));
   const messageId='<'+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('')+'@usagi.mikanyan.com>';
   const result=await transport.sendMail({from:{name:'点兔贺年祭 · Gochiusa New Year Fiesta',address:env.MAIL_FROM},to:message.to,subject:message.subject,text:message.text,html:message.html,messageId});
   if(!result.accepted.length || result.rejected.length)throw new AppError(503,'邮件收件人未被接受，请检查邮箱地址');
   return {messageId:result.messageId};
  }catch(error){
   if(error instanceof AppError)throw error;
   // Never log the SMTP response, credentials or message content.
   console.error(JSON.stringify(smtpDiagnostic(error)));
   throw new AppError(503,'邮件服务暂时不可用，请稍后重试或联系活动管理员');
  }finally{transport.close();}
 }
 if(String(env.MAIL_PROVIDER)==='local' && env.ENVIRONMENT==='development'){
  const url=env.MAIL_TEST_ENDPOINT;if(!url || !/^http:\/\/(127\.0\.0\.1|localhost):[0-9]+\//.test(url))throw new AppError(503,'本地邮件测试服务未配置');
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':message.key},body:JSON.stringify(message),signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new AppError(503,'本地邮件测试服务不可用');return {messageId:message.key};
 }
 if(String(env.MAIL_PROVIDER)==='resend' && env.MAIL_API_TOKEN && env.MAIL_FROM){
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.MAIL_API_TOKEN,'Content-Type':'application/json','Idempotency-Key':message.key},body:JSON.stringify({from:env.MAIL_FROM,to:[message.to],subject:message.subject,text:message.text,html:message.html}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new AppError(503,'邮件服务暂时不可用');const result=await r.json() as {id:string};return {messageId:result.id};
 }
 if(String(env.MAIL_PROVIDER)==='cloudflare' && env.MAIL_FROM){return env.EMAIL.send({from:env.MAIL_FROM,to:message.to,subject:message.subject,text:message.text,html:message.html});}
 throw new AppError(503,'邮件发送服务尚未配置，请联系活动管理员');
}
export function outbox(db:D1Database,submissionId:string,eventKey:string,to:string,subject:string,text:string){return sql(db,'INSERT INTO email_outbox(id,event_key,submission_id,recipient,subject,text,next_attempt_at,created_at) VALUES(?,?,?,?,?,?,?,?)',id(),eventKey,submissionId,to,subject,text,now(),now());}
interface MailTask {id:string;event_key:string;recipient:string;subject:string;text:string;attempts:number}
export async function consumeOutbox(env:Env){
 const tasks=await all<MailTask>(env.DB,"SELECT * FROM email_outbox WHERE (status='queued' AND next_attempt_at<=?) OR (status='sending' AND lease_until<=?) LIMIT 20",now(),now());
 for(const task of tasks){
  const lease=id();const claimed=await sql(env.DB,"UPDATE email_outbox SET status='sending',lease_token=?,lease_until=?,attempts=attempts+1 WHERE id=? AND ((status='queued' AND next_attempt_at<=?) OR (status='sending' AND lease_until<=?))",lease,new Date(Date.now()+60000).toISOString(),task.id,now(),now()).run();if(!claimed.meta.changes)continue;
  try{const sent=await sendMail(env,{to:task.recipient,subject:task.subject,text:task.text,key:task.event_key});await sql(env.DB,"UPDATE email_outbox SET status='sent',provider_id=?,lease_token=NULL,lease_until=NULL,last_error=NULL WHERE id=? AND lease_token=?",sent.messageId,task.id,lease).run();}
  catch(error){await sql(env.DB,"UPDATE email_outbox SET status=?,next_attempt_at=?,lease_token=NULL,lease_until=NULL,last_error=? WHERE id=? AND lease_token=?",task.attempts+1>=6?'failed':'queued',new Date(Date.now()+Math.min(3600000,60000*2**task.attempts)).toISOString(),error instanceof AppError?error.message:'邮件供应商请求失败',task.id,lease).run();}
 }
}
