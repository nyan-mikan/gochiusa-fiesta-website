import type {Character} from '../../shared/models';

const preferredOrder=['chino','cocoa','rize','syaro','chiya','megu','maya','fuyu','natsume','elu','tippy'];

export function orderCharacters<T extends Pick<Character,'kind'|'stable_key'>>(characters:readonly T[]):T[]{
 const rank=(character:T)=>character.kind==='builtin'?preferredOrder.indexOf(character.stable_key):-1;
 return [...characters].sort((a,b)=>{
  const left=rank(a),right=rank(b);
  return (left<0?preferredOrder.length:left)-(right<0?preferredOrder.length:right);
 });
}
