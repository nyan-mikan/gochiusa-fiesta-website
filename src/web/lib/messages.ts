import {shallowRef} from 'vue';
export type MessageKind='E'|'W'|'S'|'I';
export interface SystemMessage {kind:MessageKind;text:string;source?:HTMLElement}
export const extraMessage=shallowRef<SystemMessage|null>(null);
export function notify(kind:MessageKind,text:string,source?:HTMLElement){extraMessage.value={kind,text,source};}
