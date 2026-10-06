import type {LanguageIssue} from '../../shared/script-language';
import {punctuationIssues} from './language-punctuation';
import {characterStyleIssues,type SpeakerContext} from './language-character';
import {knownReference,referenceIssues,referenceWarning} from './language-references';

type Issue=Pick<LanguageIssue,'category'|'excerpt'|'problem'|'suggestion'>;
// Only unmistakable abusive expressions: ordinary references to someone's mother
// and literal objects must not be treated as insults.
const coarse=[/(?:你|我|真)\s*(他妈(?:的)?)(?!妈)/gu,/(傻[逼屄bBｂＢ]|操你妈|艹你妈|狗娘养的)/gu,/(?:^|[，。！？!?,\n])\s*(妈的|你妈的)(?=[，。！？!?,\s]|$)/gu];
export function registerIssues(text:string):Issue[]{
 const found=new Set<string>();for(const pattern of coarse)for(const match of text.matchAll(pattern))found.add(match[1]!);
 return [...found].map(excerpt=>({category:'register',excerpt,problem:'含粗口或辱骂“'+excerpt+'”，不适合公开活动主持稿。',suggestion:'删除“'+excerpt+'”，用不含粗口或辱骂的措辞表达原意；将责备改为客观描述或礼貌提醒。'}));
}
export function combineLanguageIssues(text:string,model:Issue[],kind:string,direction:string,context:SpeakerContext):Issue[]{
 // A provider cannot turn a catalog alias or ordinary pronoun into an unknown
 // character. Filter only that issue class; keep unrelated grammar/style advice.
 model=model.filter(value=>!referenceWarning(value)||kind==='dialogue'&&!!context.character_catalog&&/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z·・ -]+$/u.test(value.excerpt)&&!knownReference(value.excerpt,context.character_catalog));
 const rules=[...registerIssues(text),...characterStyleIssues(kind,direction,context),...referenceIssues(text,kind,context.character_catalog),...punctuationIssues(text,kind)],coarseDescription=(value:Issue)=>/(粗口|辱骂|脏话|粗俗|骂人)/u.test(value.problem);
 const punctuationKind=(value:Issue)=>['省略号','半角','问号','末尾缺少','空格'].find(word=>value.problem.includes(word));
 const overlaps=(a:Issue,b:Issue)=>{
  if(!(a.excerpt.includes(b.excerpt)||b.excerpt.includes(a.excerpt)))return false;
  if(referenceWarning(a)&&referenceWarning(b))return true;
  if(a.category==='register'&&b.category==='register')return coarseDescription(a)&&coarseDescription(b)||/仿古|文言/u.test(a.problem)&&/仿古|文言/u.test(b.problem)&&a.problem.includes('智乃')&&b.problem.includes('智乃');
  const punctuation=punctuationKind(a);return !!punctuation&&punctuation===punctuationKind(b);
 };
 const merged=rules.map(rule=>model.find(value=>overlaps(rule,value))??rule);
 for(const value of model)if(!merged.some(existing=>overlaps(existing,value)))merged.push(value);
 return merged.slice(0,20);
}
