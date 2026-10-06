import {createServer} from 'node:http';import {once} from 'node:events';import assert from 'node:assert/strict';
export const reviewFixtureVars=['--var','SCRIPT_REVIEW_API_URL:http://127.0.0.1:8040/v1/chat/completions','--var','SCRIPT_REVIEW_API_KEY:local-review-fixture-not-a-real-key','--var','SCRIPT_REVIEW_MODEL:local-review-fixture-model','--var','SCRIPT_REVIEW_REASONING_EFFORT:low'];
export async function languageFixture(){
 const calls=[],holds=new Map();
 const server=createServer(async(req,res)=>{
  if(req.url!=='/v1/chat/completions'||req.method!=='POST'){res.writeHead(404);res.end();return;}
  try{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw),input=JSON.parse(body.messages[1].content);calls.push({body,input,authorization:req.headers.authorization});
   if(input.text.includes('慢响应'))await new Promise(resolve=>holds.set(input.text,resolve));
   if(input.text.includes('供应商失败')){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'local-review-fixture-not-a-real-key local-review-fixture-model http://127.0.0.1:8040/v1/chat/completions'}));return;}
   const categories=['grammar','particle','typo','neologism','register'],issues=input.text.includes('五项检查')?categories.map(category=>({category,excerpt:'五项检查',problem:'明确的'+category+'问题',suggestion:'使用自然、准确、得体的表达。'})):input.text.includes('开心的')?[{category:'particle',excerpt:'开心的',problem:'“的”用于修饰动作时应改为“地”。',suggestion:'改为“我开心地跑向舞台。”'}]:[];
   if(input.text.includes('重复得体提示'))issues.push({category:'register',excerpt:'他妈',problem:'公开主持时使用粗口不得体。',suggestion:'可改为“你今天起得有点晚呢。”'});
   if(input.text.includes('从今天起我们就是恋人了')){
    assert.match(body.messages[0].content,/独立检查严重 CP 倾向/);assert.match(body.messages[0].content,/不以是否异性\/同性配对作区别/);assert.match(body.messages[0].content,/不因亲近词语单独报错/);assert.match(body.messages[0].content,/CB（友情、搭档、组合关系）允许/);
    issues.push({category:'register',excerpt:'从今天起我们就是恋人了，你只能喜欢我，不许再对别人那么好',problem:'严重 CP 倾向：强行确立恋爱关系，并要求排他占有，偏离正常友情或姐妹互动。',suggestion:'改为“心爱，能和你一起参加活动，我很开心。也希望大家都能成为好朋友。”'});
   }
   const ooc='本大爷最了不起，你们都低我一等。';
   for(const part of input.speaker_context?.segments??[])if(part.text.includes(ooc))for(const index of part.speakers){const speaker=input.speaker_context.speakers.find(s=>s.speaker===index);if(speaker?.preset==='chino')issues.push({category:'register',excerpt:ooc,problem:'这段狂妄贬低他人的话明显不符合香风智乃通常礼貌克制的性格。',suggestion:'改为礼貌、克制的表达，避免宣称自己高人一等。'});}
   if(input.text.includes('泄露测试'))issues.push({category:'other',excerpt:'泄露测试',problem:'local-review-fixture-not-a-real-key',suggestion:'local-review-fixture-model http://127.0.0.1:8040/v1/chat/completions'});
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({model:'local-review-fixture-model',internal_provider:'never expose',choices:[{message:{content:input.text.includes('坏结构')?'local-review-fixture-not-a-real-key':JSON.stringify({issues})}}]}));
  }catch{res.writeHead(500);res.end();}
 });server.listen(8040,'127.0.0.1');await once(server,'listening');
 return {calls,holds,release:()=>{for(const resolve of holds.values())resolve();holds.clear();},close:async()=>{for(const resolve of holds.values())resolve();holds.clear();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
