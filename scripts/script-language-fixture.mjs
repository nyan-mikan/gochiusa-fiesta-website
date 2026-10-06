import {createServer} from 'node:http';import {once} from 'node:events';
export const reviewFixtureVars=['--var','SCRIPT_REVIEW_API_URL:http://127.0.0.1:8040/v1/chat/completions','--var','SCRIPT_REVIEW_API_KEY:local-review-fixture-not-a-real-key','--var','SCRIPT_REVIEW_MODEL:local-review-fixture-model','--var','SCRIPT_REVIEW_REASONING_EFFORT:low'];
export async function languageFixture(){
 const calls=[],holds=new Map();
 const server=createServer(async(req,res)=>{
  if(req.url!=='/v1/chat/completions'||req.method!=='POST'){res.writeHead(404);res.end();return;}
  try{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw),input=JSON.parse(body.messages[1].content);calls.push({body,input,authorization:req.headers.authorization});
   if(input.text.includes('慢响应'))await new Promise(resolve=>holds.set(input.text,resolve));
   if(input.text.includes('供应商失败')){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'local-review-fixture-not-a-real-key local-review-fixture-model http://127.0.0.1:8040/v1/chat/completions'}));return;}
   const categories=['grammar','particle','typo','neologism','register'],issues=input.text.includes('五项检查')?categories.map(category=>({category,excerpt:'五项检查',problem:'明确的'+category+'问题',suggestion:'使用自然、准确、得体的表达。'})):input.text.includes('开心的')?[{category:'particle',excerpt:'开心的',problem:'“的”用于修饰动作时应改为“地”。',suggestion:'改为“我开心地跑向舞台。”'}]:[];
   if(input.text.includes('泄露测试'))issues.push({category:'other',excerpt:'泄露测试',problem:'local-review-fixture-not-a-real-key',suggestion:'local-review-fixture-model http://127.0.0.1:8040/v1/chat/completions'});
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({model:'local-review-fixture-model',internal_provider:'never expose',choices:[{message:{content:input.text.includes('坏结构')?'local-review-fixture-not-a-real-key':JSON.stringify({issues})}}]}));
  }catch{res.writeHead(500);res.end();}
 });server.listen(8040,'127.0.0.1');await once(server,'listening');
 return {calls,holds,release:()=>{for(const resolve of holds.values())resolve();holds.clear();},close:async()=>{for(const resolve of holds.values())resolve();holds.clear();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
