// Local browser regression aid only. Proxy 8787 -> local workerd 8788; controls bind to loopback 8791.
import {createServer} from 'node:http';
const config={snapshotDelay:0,holdSnapshots:false,holdPosts:false,holdProgram:false,failBlocks:0,failLines:0},requests=[],waiters=[];
function release(){for(const done of waiters.splice(0))done();}
async function wait(kind){if(kind==='snapshot'&&config.snapshotDelay)await new Promise(r=>setTimeout(r,config.snapshotDelay));if(kind==='snapshot'&&config.holdSnapshots||kind==='post'&&config.holdPosts||kind==='program'&&config.holdProgram)await new Promise(r=>waiters.push(r));}
const proxy=createServer(async(req,res)=>{
 try{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks),headers=new Headers();
  for(const [k,v] of Object.entries(req.headers))if(v!==undefined&&!['host','connection','content-length'].includes(k))headers.set(k,Array.isArray(v)?v.join(','):v);
  // Translate only the proxy's own same-origin request to its loopback upstream; foreign origins remain rejected.
  if(headers.get('origin')==='http://localhost:8787')headers.set('origin','http://localhost:8788');
  const operation=req.url.endsWith('/script/operations')?JSON.parse(body.toString()):null;
  const entry={method:req.method,path:req.url,operation:operation?.type,id:operation?.id,expectedVersion:operation?.expectedVersion,status:null,committed:false,released:false};requests.push(entry);
  if(operation?.type==='block.add'&&config.failBlocks>0||operation?.type==='line.add'&&config.failLines>0){if(operation.type==='block.add')config.failBlocks--;else config.failLines--;entry.status=503;entry.released=true;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'本地测试：模拟创建失败'}));return;}
  const upstream=await fetch('http://localhost:8788'+req.url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:body,redirect:'manual'}),data=Buffer.from(await upstream.arrayBuffer());
  entry.status=upstream.status;entry.committed=true;
  if(req.method==='GET'&&req.url.endsWith('/script'))await wait('snapshot');else if(operation&&upstream.ok)await wait('post');else if(req.method==='PUT'&&req.url.endsWith('/program')&&upstream.ok)await wait('program');
  const outgoing={};upstream.headers.forEach((v,k)=>{if(!['content-encoding','content-length','transfer-encoding','set-cookie'].includes(k))outgoing[k]=v;});
  if(upstream.headers.getSetCookie().length)outgoing['set-cookie']=upstream.headers.getSetCookie();outgoing['content-length']=data.length;
  res.writeHead(upstream.status,outgoing);res.end(data);entry.released=true;
 }catch(error){res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
});
proxy.on('upgrade',(_req,socket)=>socket.end('HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\n\r\n'));
proxy.listen(8787,'127.0.0.1',()=>console.log('Local latency proxy ready on 8787; controls on loopback 8791.'));
const controls=createServer(async(req,res)=>{
 if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body||'{}');for(const k of Object.keys(config))if(k in input)config[k]=input[k];if(input.release)release();if(input.clear)requests.length=0;}
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({config,requests}));
});controls.listen(8791,'127.0.0.1');
process.on('SIGINT',()=>{release();proxy.close();controls.close();process.exit(0);});
