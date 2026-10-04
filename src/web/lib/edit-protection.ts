import {onBeforeUnmount} from 'vue';
import {session} from './api';
export function protectUnload(dirty:()=>boolean){const leave=(e:BeforeUnloadEvent)=>{if(dirty()){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',leave);onBeforeUnmount(()=>window.removeEventListener('beforeunload',leave));}
const key=(scope:string)=>`usagi-edit:${session.user?.id}:${scope}`;
export function readDraft<T>(scope:string):T|null{try{return JSON.parse(localStorage.getItem(key(scope))??'null') as T|null;}catch{return null;}}
export function writeDraft(scope:string,value:unknown){try{localStorage.setItem(key(scope),JSON.stringify(value));return true;}catch{return false;}}
export function clearDraft(scope:string){try{localStorage.removeItem(key(scope));}catch{/* The live editor remains usable. */}}
