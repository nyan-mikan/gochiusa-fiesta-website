import type {LanguageIssue} from '../../shared/script-language';

type Issue=Pick<LanguageIssue,'category'|'excerpt'|'problem'|'suggestion'>;
// Only unmistakable abusive expressions: ordinary references to someone's mother
// and literal objects must not be treated as insults.
const coarse=[/(?:你|我|真)\s*(他妈(?:的)?)(?!妈)/gu,/(傻[逼屄bBｂＢ]|操你妈|艹你妈|狗娘养的)/gu,/(?:^|[，。！？!?,\n])\s*(妈的|你妈的)(?=[，。！？!?,\s]|$)/gu];
export function registerIssues(text:string):Issue[]{
 const found=new Set<string>();for(const pattern of coarse)for(const match of text.matchAll(pattern))found.add(match[1]!);
 return [...found].map(excerpt=>({category:'register',excerpt,problem:'含粗口或辱骂“'+excerpt+'”，不适合公开活动主持稿。',suggestion:'删除“'+excerpt+'”，用不含粗口或辱骂的措辞表达原意；将责备改为客观描述或礼貌提醒。'}));
}
export function combineLanguageIssues(text:string,model:Issue[]):Issue[]{
 const rules=registerIssues(text),coarseDescription=(value:Issue)=>/(粗口|辱骂|脏话|粗俗|骂人)/u.test(value.problem),overlaps=(a:Issue,b:Issue)=>a.category==='register'&&b.category==='register'&&coarseDescription(a)&&coarseDescription(b)&&(a.excerpt.includes(b.excerpt)||b.excerpt.includes(a.excerpt));
 const merged=rules.map(rule=>model.find(value=>overlaps(rule,value))??rule);
 for(const value of model)if(!merged.some(existing=>overlaps(existing,value)))merged.push(value);
 return merged.slice(0,20);
}
