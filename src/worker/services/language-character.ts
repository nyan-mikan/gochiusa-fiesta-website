import type {Character,Line} from '../../shared/models';
import {dialogueSegments,dialogueSpeakers} from '../../shared/dialogue';
import {all} from './core';

export const characterProfiles:Record<string,{name:string;personality:string}>={
 cocoa:{name:'保登心爱',personality:'元气、热情、亲切，喜欢交朋友和照顾大家，憧憬姐姐的身份；有时冒失或想当然。正常的兴奋、撒娇、逞姐姐和温柔打趣符合她；冷酷羞辱朋友、恶意排斥他人明显不符合她。'},
 chino:{name:'香风智乃',personality:'文静、慢热，通常礼貌克制，认真照顾咖啡店；会冷静吐槽心爱，也会害羞、闹别扭或表达亲近。正常简短回应、吐槽和偶尔活泼不算违背性格；狂妄自大、粗暴辱骂或以伤害朋友为乐明显不符合她。'},
 rize:{name:'天天座理世',personality:'认真、可靠、有责任感，带有军人家庭影响的直率与干练；内心也喜欢可爱事物，可能害羞、慌张。军事用语、较强语气和正常吐槽可接受；恶意欺凌、无理由羞辱朋友或完全漠视同伴明显不符合她。'},
 chiya:{name:'宇治松千夜',personality:'温柔、从容，有和风气质，喜欢诗意命名和逗趣，有时一本正经地开玩笑或调侃伙伴。腹黑玩笑不等于恶意；持续仇视朋友、恶毒羞辱或冷酷欺凌明显不符合她。'},
 syaro:{name:'桐间纱路',personality:'认真、努力、勤俭，待人通常礼貌，容易害羞，也会倔强、紧张或激动地吐槽；对理世带有憧憬。情绪变化不应机械判错；傲慢炫富、恶意轻视贫穷者或残酷羞辱朋友明显不符合她。'},
 maya:{name:'条河麻耶',personality:'活泼开朗、直爽、爱运动，喜欢玩闹与尝试，发言可以随意、爽快、带些淘气。较大声和直接调侃不是错误；持续恶意欺凌、冷酷伤害朋友明显不符合她。'},
 megu:{name:'奈津惠',personality:'温柔、天真、容易害羞，有时天然呆，重视朋友，也憧憬成熟和勇敢。偶尔坚定、兴奋或尝试主动符合成长；强势恶毒地羞辱、操控朋友明显不符合她。'},
 tippy:{name:'提比',personality:'通常带有成熟长辈的关怀和幽默，关注智乃与咖啡店，也会吐槽或困扰；并非普通只会卖萌的兔子。关怀、长辈式提醒与玩笑可接受；冷酷厌弃智乃或恶意伤害家人明显不符合它。'},
 mocha:{name:'保登萌香（摩卡）',personality:'温暖、亲切、包容，姐姐气质强，关爱心爱并照顾周围的人，也可能天然、兴奋或逗弄妹妹。姐姐式玩笑可接受；冷酷厌弃妹妹、恶意羞辱亲友明显不符合她。'},
 aoyama:{name:'青山翠',personality:'温和、悠然，带有作家的观察力和文艺气质，有时天然或调皮，以温柔方式打趣和寻找灵感。玩笑、联想和轻松吐槽可接受；恶毒敌视伙伴或粗暴羞辱他人明显不符合她。'}
};
export interface SpeakerContext {profile_version:number;speakers:{speaker:number;name:string;preset:string|null;personality:string|null}[];segments:{text:string;speakers:number[]}[]}
export async function speakerContext(db:D1Database,line:Line):Promise<SpeakerContext>{
 const ids=dialogueSpeakers(line),chunks=Array.from({length:Math.ceil(ids.length/50)},(_,index)=>ids.slice(index*50,index*50+50));
 const characters=(await Promise.all(chunks.map(ids=>all<Pick<Character,'id'|'stable_key'|'kind'|'name'>>(db,'SELECT id,stable_key,kind,name FROM characters WHERE id IN('+ids.map(()=>'?').join(',')+')',...ids)))).flat();
 // Only known presets enter the review. Unlisted speaker indexes mean no preset,
 // even when a custom character has the same display name as a canonical one.
 return {profile_version:1,speakers:ids.map((id,speaker)=>{const c=characters.find(c=>c.id===id),profile=c?.kind==='builtin'?characterProfiles[c.stable_key]:undefined;return {speaker,name:profile?.name??'未预设角色',preset:profile&&c?c.stable_key:null,personality:profile?.personality??null};}).filter(speaker=>speaker.preset!==null),segments:dialogueSegments(line).map(part=>({text:part.text,speakers:part.speaker_ids.map(id=>ids.indexOf(id))}))};
}
