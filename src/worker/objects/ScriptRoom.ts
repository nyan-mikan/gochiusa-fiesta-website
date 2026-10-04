import { DurableObject } from 'cloudflare:workers';
import { actor, all, AppError, first, sessionHash } from '../services/core';
import { context, scriptMutation, programMutation, characterMutation } from '../services/room';
import type { Change } from '../../shared/models';

// One coordinator per event; D1 remains the source of business data.
export class ScriptRoom extends DurableObject<Env> {
  private tail:Promise<void>=Promise.resolve();
  private async enqueue<T>(task:()=>Promise<T>):Promise<T>{
    const previous=this.tail;let release:()=>void=()=>{};this.tail=new Promise<void>(r=>{release=r;});
    await previous;try{return await task();}finally{release();}
  }
  private async reply<T>(task:()=>Promise<T>){try{return {ok:true as const,value:await task()};}catch(error){return {ok:false as const,status:error instanceof AppError?error.status:500,message:error instanceof AppError?error.message:'服务器处理失败',details:error instanceof AppError?error.details:null};}}
  async script(eventId:string,hash:string,input:unknown){return this.reply(()=>this.enqueue(async()=>{const result=await scriptMutation(this.env,hash,eventId,input);await this.broadcast(eventId,result.seq);return result;}));}
  async program(eventId:string,hash:string,input:unknown,lock=false){return this.reply(()=>this.enqueue(async()=>{const result=await programMutation(this.env,hash,eventId,input,lock);await this.broadcast(eventId,result.seq);return result;}));}
  async characters(eventId:string,hash:string,input:unknown){return this.reply(()=>this.enqueue(async()=>{const result=await characterMutation(this.env,hash,eventId,input);await this.broadcast(eventId,result.seq);return result;}));}
  private async broadcast(eventId:string,seq:number){
    const {p}=await context(this.env,eventId);const change=await first<Change>(this.env.DB,'SELECT seq,type,payload,operation_id FROM program_changes WHERE program_id=? AND seq=?',p.id,seq);
    if(!change)return;
    for(const ws of this.ctx.getWebSockets()){
      const attachment=ws.deserializeAttachment() as {eventId:string;hash:string};if(attachment.eventId!==eventId)continue;
      try{await actor(this.env,attachment.hash,true);ws.send(JSON.stringify({type:'change',change}));}catch{ws.close(4001,'session_expired');}
    }
  }
  async fetch(request:Request){
    const url=new URL(request.url);if(request.headers.get('Origin')!==url.origin)return new Response('Forbidden',{status:403});
    if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('Upgrade required',{status:426});
    const match=url.pathname.match(/\/events\/([^/]+)\/realtime$/);if(!match)return new Response('Not found',{status:404});
    const eventId=decodeURIComponent(match[1]),hash=await sessionHash(request);
    try{await actor(this.env,hash,true);}catch{return new Response('Unauthorized',{status:401});}
    const {p}=await context(this.env,eventId);const pair=new WebSocketPair();const [client,server]=Object.values(pair);
    server.serializeAttachment({eventId,hash});this.ctx.acceptWebSocket(server);server.send(JSON.stringify({type:'hello',seq:p.change_seq}));
    await this.ctx.storage.setAlarm(Date.now()+60000);return new Response(null,{status:101,webSocket:client});
  }
  async webSocketMessage(ws:WebSocket,message:string|ArrayBuffer){
    const data=ws.deserializeAttachment() as {eventId:string;hash:string};
    try{await actor(this.env,data.hash,true);const {p}=await context(this.env,data.eventId);ws.send(JSON.stringify({type:'hello',seq:p.change_seq}));}catch{ws.close(4001,'session_expired');}
  }
  async alarm(){
    for(const ws of this.ctx.getWebSockets()){const data=ws.deserializeAttachment() as {hash:string};try{await actor(this.env,data.hash,true);}catch{ws.close(4001,'session_expired');}}
    if(this.ctx.getWebSockets().length)await this.ctx.storage.setAlarm(Date.now()+60000);
  }
  async webSocketClose(ws:WebSocket,code:number,reason:string){ws.close(code,reason);}
  async health(): Promise<{ d1: boolean }> {
    const result = await this.env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    return { d1: result?.ok === 1 };
  }
}
