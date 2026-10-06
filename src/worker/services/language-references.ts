import type {LanguageIssue} from '../../shared/script-language';
import {all} from './core';

export interface ReferenceCatalog {version:1;characters:{name:string;aliases:string[]}[]}
// Library membership is event-scoped. Archived builtins still exist in the
// series catalog; archived custom identities are removed from current use.
export async function referenceCatalog(db:D1Database,eventId:string):Promise<ReferenceCatalog>{
 const rows=await all<{name:string;japanese_name:string;display_name:string;aliases_json:string}>(db,"SELECT c.name,c.japanese_name,COALESCE(o.display_name,c.name) AS display_name,(SELECT json_group_array(alias) FROM character_aliases WHERE character_id=c.id) AS aliases_json FROM characters c LEFT JOIN event_character_overrides o ON o.character_id=c.id AND o.event_id=? WHERE c.kind<>'auxiliary' AND (c.event_id IS NULL OR (c.event_id=? AND c.archived=0)) ORDER BY c.name,c.id",eventId,eventId);
 return {version:1,characters:rows.map(row=>({name:row.display_name,aliases:[...new Set([row.name,row.japanese_name,...JSON.parse(row.aliases_json) as string[]])].filter(Boolean)}))};
}
const normalize=(value:string)=>value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
const pronounsAndTitles=new Set(('我 你 您 他 她 它 我们 咱们 你们 您们 他们 她们 它们 大家 各位 诸位 各位观众 观众朋友们 小可爱 小家伙 乖乖 宝贝 小伙伴 小伙伴们 朋友 朋友们 好朋友 同学 同学们 小朋友 小朋友们 姐姐 哥哥 妹妹 弟弟 姊姊 妈妈 爸爸 爷爷 奶奶 老师 店长 店员 客人 客人们 嘉宾 主持人 观众 观众们 前辈 后辈 先生 女士 大小姐 少爷 那个人 某人 那位 这位 各位来宾 各位朋友 各位同学 大朋友 世界 阳光 太阳 月亮 天空 春天 青春 时光 森林 大海 咖啡 甜点 浅水区 甘兔庵 everyone everybody i we he she it they them us me him her you sir madam friends folks guys').split(' ').concat('rabbit house'));
export function knownReference(name:string,catalog:ReferenceCatalog):boolean{
 const value=normalize(name);if(pronounsAndTitles.has(value))return true;
 const stripped=value.replace(/^(?:小|阿)/u,'').replace(/(?:酱|ちゃん|さん|君|桑|姐姐|姊姊|姐|哥哥|哥|妹妹|妹|弟弟|弟|前辈|老师|先生|女士|同学|小姐|様|さま)$/u,'');
 return catalog.characters.some(character=>[character.name,...character.aliases].some(alias=>normalize(alias)===value||normalize(alias)===stripped));
}
export function nicknameReference(name:string):boolean{return /^(?:小|阿)|(?:酱|ちゃん|姐姐|哥哥|妹妹|弟弟|前辈|老师|同学|先生|女士)$/u.test(name);}
export function referenceIssues(text:string,kind:string,catalog?:ReferenceCatalog):Pick<LanguageIssue,'category'|'excerpt'|'problem'|'suggestion'>[]{
 if(kind!=='dialogue'||!catalog)return [];
 const found=new Set<string>();
 // Only explicit greeting vocatives, not arbitrary Chinese words or objects.
 // Other name mentions and ambiguous nicknames require semantic review.
 const pattern=/(?:^|[。！？!?\n])(?:早上好|上午好|下午好|晚上好|早安|晚安|你好|再见)(?:啊|呀|哦|呢)?[，,、]\s*([\p{Script=Han}]{2,8}|[A-Za-z][A-Za-z -]{1,39})(?=[。！？!?，,；;\n]|$)/gu;
 for(const match of text.matchAll(pattern)){
  const name=match[1]!.trim();if(knownReference(name,catalog))continue;
  // Unresolved forms that could be a nickname/title are not definitive names.
  if(nicknameReference(name))continue;
  // A greeting can also introduce a topic: reject ordinary descriptive clauses.
  if(/(?:今天|明天|天气|早晨|开始|继续|一起|加油|谢谢|咖啡|甜点|浅水区|准备|真好|辛苦|开心|快乐|欢迎|是|的|了|在|有|很)/u.test(name))continue;
  found.add(name);
 }
 return [...found].map(excerpt=>({category:'other',excerpt,problem:'“'+excerpt+'”在这里作为被称呼的人名使用，但登记时的角色库中没有对应姓名或已知别名。',suggestion:'核对“'+excerpt+'”是否写错；若指已有角色，使用该角色的姓名或已知小名。若为新角色，请先在本活动角色库添加，再修改台词并重新审阅。'}));
}
export function referenceWarning(issue:Pick<LanguageIssue,'category'|'problem'>):boolean{return issue.category==='other'&&/角色库|未登记.{0,6}(?:角色|人名)|未知.{0,4}(?:角色|人名)/u.test(issue.problem);}
