export const MAX_WISH_AUDIO_SIZE=20*1024*1024;
export interface Wish {id:string;event_id:string;display_name:string;text:string;status:'draft'|'submitted';version:number;created_at:string;submitted_at:string|null;filename:string|null;content_type:string|null;size:number|null;audio_version?:string|null}
export interface WishList {items:Wish[];total:number;page:number;audio_ready:boolean}
