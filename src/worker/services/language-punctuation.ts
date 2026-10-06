import type {LanguageIssue} from '../../shared/script-language';

type Issue=Pick<LanguageIssue,'category'|'excerpt'|'problem'|'suggestion'>;
const han=/\p{Script=Han}/u;

// Keep source offsets while shielding English, URLs, addresses, numbers and code.
// These finite typography rules supplement semantic review, not sentence parsing.
function prose(text:string):string{
 let result=text.replace(/"[^"\n]*"|'[^'\n]*'/gu,value=>han.test(value)?value:' '.repeat(value.length));
 for(const pattern of [/`[^`]*`/gu,/https?:\/\/[^\s，。！？；“”「」]+/gu,/[\w.+-]+@[\w.-]+\.[A-Za-z]+/gu,/\d+(?:[.:/,\-]\d+)+/gu,/[A-Za-z][A-Za-z\d]*(?:[\s,!?;:'"().-]+[A-Za-z\d]+)*[.!?]?/gu])result=result.replace(pattern,value=>' '.repeat(value.length));
 return result;
}
export function punctuationIssues(text:string,kind:string):Issue[]{
 if(!han.test(text))return [];
 const issues:Issue[]=[],add=(excerpt:string,problem:string,suggestion:string)=>{excerpt=excerpt.slice(0,500);if(!issues.some(i=>i.excerpt===excerpt&&i.problem===problem))issues.push({category:'grammar',excerpt,problem,suggestion:suggestion.slice(0,500)});};
 let source=prose(text);
 const ellipses=[...source.matchAll(/\.{2,}|…+/gu)].filter(match=>match[0]!=='……');
 for(const match of ellipses){add(match[0],'中文省略号写法不规范，应使用两个省略号字符“……”，不能用普通点号或单个省略号代替。','将这组连续点号改为“……”。');}
 source=source.replace(/\.{2,}|…+/gu,value=>' '.repeat(value.length));
 const substitutions:Record<string,string>={',':'，','?':'？','!':'！',';':'；',':':'：','.':'。','(':'（',')':'）','"':'“或”',"'":'‘或’'};
 const halfwidth=[...new Set([...source.matchAll(/[,!?:;.()"']/gu)].map(match=>match[0]))];
 for(const mark of halfwidth)add(mark,'中文句子使用了半角标点“'+mark+'”。','按中文语境将“'+mark+'”改为全角标点“'+substitutions[mark]+'”；保留英文、链接、数字和代码中的原有写法。');
 // Match against original offsets; never mistake spaces shielding an English term
 // for spaces typed between two Chinese words.
 for(const match of text.matchAll(/\p{Script=Han}[ \t\u3000]+\p{Script=Han}/gu)){
  if(!han.test(source.slice(match.index,match.index+match[0].length)))continue;
  add(match[0],'中文词句之间出现空格，可能用空格代替了停顿标点。','根据句意将空格改为“，”等合适标点；若属于同一词语，则去掉空格。');
 }
 if(kind!=='dialogue')return issues;
 // A direct question ending in 吗 is unambiguous; other interrogative intent,
 // embedded questions and missing internal separators belong to semantic review.
 const questions=[...text.matchAll(/[^。！？!?；;\n]*吗[。！!]?/gu)].filter(match=>/吗[。！!]?$/.test(match[0])&&!/^\s*$/.test(match[0]));
 let trailingQuestion=false;
 for(const match of questions){const end=match.index+match[0].length,next=text.slice(end).match(/^[”’」』）)\s]*/u)?.[0].length??0;if(/[？?]/.test(text[end+next]??''))continue;if(!/^(?:[。！!]|[”’」』）)\s]*$)/u.test(text.slice(end))&&end!==text.length)continue;
  const excerpt=match[0].trim().slice(-100);if(!excerpt)continue;
  add(excerpt,'直接问句缺少问号，疑问语气没有用“？”标明。','在该问句末尾使用中文问号“？”。');trailingQuestion ||= /^\s*[”’」』）)]*\s*$/u.test(text.slice(end));
 }
 const tail=text.trim().replace(/[”’」』）)]+$/u,'').trimEnd();
 if(han.test(tail)&&!/[。！？!?；;：:…]$/u.test(tail)&&!trailingQuestion&&!/\.{2,}$/u.test(tail)&&!/(?:https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[A-Za-z]+|`[^`]*`)$/u.test(tail))add(tail.slice(-80),'中文台词末尾缺少句末标点。','按陈述、疑问或感叹语气，在句末补上“。”“？”或“！”。');
 return issues;
}
