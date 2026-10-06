import {createServer} from 'node:http';import {once} from 'node:events';import assert from 'node:assert/strict';
export const reviewFixtureVars=['--var','SCRIPT_REVIEW_API_URL:http://127.0.0.1:8040/v1/chat/completions','--var','SCRIPT_REVIEW_API_KEY:local-review-fixture-not-a-real-key','--var','SCRIPT_REVIEW_MODEL:local-review-fixture-model','--var','SCRIPT_REVIEW_REASONING_EFFORT:low'];
export async function languageFixture(){
 const calls=[],holds=new Map();
 const server=createServer(async(req,res)=>{
  if(req.url!=='/v1/chat/completions'||req.method!=='POST'){res.writeHead(404);res.end();return;}
  try{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw),input=JSON.parse(body.messages[1].content);calls.push({body,input,authorization:req.headers.authorization});
   if(input.scope==='paragraph'){
    assert.match(body.messages[0].content,/按输入 lines 的顺序检查整段/);assert.match(body.messages[0].content,/没有明确地点依据时不猜测地点/);
    if(input.title.includes('慢段落'))await new Promise(resolve=>holds.set('paragraph:'+input.title,resolve));
    if(input.title.includes('失败段落')){res.writeHead(503);res.end();return;}
    const issues=[],ended=input.lines.find(l=>l.text.includes('演出已经结束了')),notStarted=input.lines.find(l=>l.text.includes('演出还没有开始')),location=input.lines.find(l=>l.text.includes('我们现在站在甘兔庵门口')),missing=input.lines.find(l=>l.text.includes('她也同意刚才的计划'));
    const transition=input.lines.some(l=>/换场|回忆/.test(l.stage_direction));
    if(ended&&notStarted&&!transition)issues.push({category:'logic',problem:'前文说演出已经结束，后文却说还没有开始，时间状态冲突。',suggestion:'统一演出时间状态，或补充明确的回忆与时间转换提示。',targets:[{line:ended.line,excerpt:'演出已经结束了'},{line:notStarted.line,excerpt:'演出还没有开始'}]});
    if(input.scene.includes('Rabbit House')&&location&&!transition)issues.push({category:'setting',problem:'场景指定在 Rabbit House 室内，台词却无换场来到甘兔庵门口。',suggestion:'改为“我们现在仍在 Rabbit House 店内”，或先补充换场提示。',targets:[{line:location.line,excerpt:'我们现在站在甘兔庵门口'}]});
    if(missing)issues.push({category:'context',problem:'“她”和“刚才的计划”缺少可解析的前文交代。',suggestion:'补充人物名称与计划内容，再表达同意。',targets:[{line:missing.line,excerpt:'她也同意刚才的计划'}]});
    if(input.title.includes('无效定位'))issues.push({category:'logic',problem:'不能映射的假问题',suggestion:'不应显示',targets:[{line:999999,excerpt:'不存在的引用'}]});
    if(input.title.includes('泄露段落'))issues.push({category:'logic',problem:'local-review-fixture-not-a-real-key',suggestion:'local-review-fixture-model',targets:[{line:input.lines[0].line,excerpt:input.lines[0].text.slice(0,10)}]});
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({internal_provider:'never expose',choices:[{message:{content:input.title.includes('坏结构段落')?'{}':JSON.stringify({issues})}}]}));return;
   }
   if(input.text.includes('慢响应'))await new Promise(resolve=>holds.set(input.text,resolve));
   if(input.text.includes('供应商失败')){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'local-review-fixture-not-a-real-key local-review-fixture-model http://127.0.0.1:8040/v1/chat/completions'}));return;}
   const categories=['grammar','particle','typo','neologism','register'],issues=input.text.includes('五项检查')?categories.map(category=>({category,excerpt:'五项检查',problem:'明确的'+category+'问题',suggestion:'使用自然、准确、得体的表达。'})):input.text.includes('开心的')?[{category:'particle',excerpt:'开心的',problem:'“的”用于修饰动作时应改为“地”。',suggestion:'改为“我开心地跑向舞台。”'}]:[];
   if(input.text.includes('重复得体提示'))issues.push({category:'register',excerpt:'他妈',problem:'公开主持时使用粗口不得体。',suggestion:'可改为“你今天起得有点晚呢。”'});
   if(input.text.includes('处心积虑')){assert.match(body.messages[0].content,/独立检查词语搭配与语义/);issues.push({category:'grammar',excerpt:'处心积虑',problem:'真诚感谢时用贬义词“处心积虑”表达褒义，词义搭配不当。',suggestion:'改为“谢谢大家用心地准备惊喜。”'});}
   if(input.text.includes('我十分地来到咖啡店'))issues.push({category:'grammar',excerpt:'十分地来到',problem:'程度副词“十分”不能这样修饰到达动作。',suggestion:'改为“我来到了咖啡店。”'});
   if(input.text.includes('gochiusa new year fiesta')){assert.match(body.messages[0].content,/英文标题式大小写校对/);assert.match(body.messages[0].content,/保留 OpenAI、iPhone、YouTube/);issues.push({category:'typo',excerpt:'gochiusa new year fiesta',problem:'英文活动专名实词首字母应大写。',suggestion:'改为“Gochiusa New Year Fiesta”。'});}
   if(input.text.includes('从今天起我们就是恋人了')){
    assert.match(body.messages[0].content,/独立检查严重 CP 倾向/);assert.match(body.messages[0].content,/不以是否异性\/同性配对作区别/);assert.match(body.messages[0].content,/不因亲近词语单独报错/);assert.match(body.messages[0].content,/CB（友情、搭档、组合关系）允许/);
    issues.push({category:'register',excerpt:'从今天起我们就是恋人了，你只能喜欢我，不许再对别人那么好',problem:'严重 CP 倾向：强行确立恋爱关系，并要求排他占有，偏离正常友情或姐妹互动。',suggestion:'改为“心爱，能和你一起参加活动，我很开心。也希望大家都能成为好朋友。”'});
   }
   const ooc='本大爷最了不起，你们都低我一等。';
   for(const part of input.speaker_context?.segments??[])if(part.text.includes(ooc))for(const index of part.speakers){const speaker=input.speaker_context.speakers.find(s=>s.speaker===index);if(speaker?.preset==='chino')issues.push({category:'register',excerpt:ooc,problem:'这段狂妄贬低他人的话明显不符合香风智乃通常礼貌克制的性格。',suggestion:'改为礼貌、克制的表达，避免宣称自己高人一等。'});}
   if(input.text.includes('人物引用检查')){assert.match(body.messages[0].content,/独立检查人物名称与角色库/);assert.match(body.messages[0].content,/excerpt 必须仅引用那个完整姓名/);assert.ok(input.speaker_context.character_catalog?.characters.length);if(!input.speaker_context.character_catalog.characters.some(c=>[c.name,...c.aliases].includes('浅水')))issues.push({category:'other',excerpt:'浅水',problem:'台词把“浅水”当人物名字提及，但角色库没有对应姓名或已知别名。',suggestion:'核对姓名，使用已有角色的姓名/小名，或先添加角色。'});}
   if(input.text.includes('别名误报检查'))issues.push({category:'other',excerpt:'可可',problem:'角色库没有对应姓名或已知别名。',suggestion:'不应显示这条假模型误报。'},{category:'other',excerpt:'智乃酱',problem:'未知角色，人名没有登记。',suggestion:'不应显示这条假模型误报。'},{category:'other',excerpt:'大家',problem:'未登记人名。',suggestion:'不应显示这条假模型误报。'},{category:'other',excerpt:'小可爱',problem:'角色库没有对应姓名或已知别名。',suggestion:'不应显示这条假模型误报。'});
   if(input.text.includes('重复标点提示'))issues.push({category:'grammar',excerpt:'...',problem:'中文省略号不应写成三个普通点。',suggestion:'将“...”改为“……”。'});
   if(input.text.includes('重复句式提示'))issues.push({category:'register',excerpt:'今日亦安然而终矣，未知明朝又将有何光景？',problem:'香风智乃在日常聊天中堆叠文言虚词、使用仿古句式，偏离自然克制的语气。',suggestion:'改为“今天也平安地过去了，不知道明天会是什么样呢？”。'});
   if(input.text.includes('泄露测试'))issues.push({category:'other',excerpt:'泄露测试',problem:'local-review-fixture-not-a-real-key',suggestion:'local-review-fixture-model http://127.0.0.1:8040/v1/chat/completions'});
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({model:'local-review-fixture-model',internal_provider:'never expose',choices:[{message:{content:input.text.includes('坏结构')?'local-review-fixture-not-a-real-key':JSON.stringify({issues})}}]}));
  }catch{res.writeHead(500);res.end();}
 });server.listen(8040,'127.0.0.1');await once(server,'listening');
 return {calls,holds,release:()=>{for(const resolve of holds.values())resolve();holds.clear();},close:async()=>{for(const resolve of holds.values())resolve();holds.clear();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
