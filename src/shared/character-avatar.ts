import {z} from 'zod';

export const MAX_AVATAR_FILE_SIZE=2*1024*1024;
export const MAX_AVATAR_SIZE=256*1024;
export const AVATAR_DIMENSION=384;
export const AVATAR_SOURCE='uploaded-avatar';
export const avatarInput=z.object({content_type:z.enum(['image/png','image/jpeg','image/webp']),data:z.string().min(1).max(Math.ceil(MAX_AVATAR_SIZE/3)*4).regex(/^[A-Za-z0-9+/]+={0,2}$/)}).strict();
export type CharacterAvatarInput=z.infer<typeof avatarInput>;

// Register official images only after verifying their source and character identity.
export const officialPortraits:Readonly<Record<string,{url:string;source:string;position?:string}>>={};

export function imageDimensions(bytes:Uint8Array,type:string):[number,number]|null{
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),text=(start:number,length:number)=>String.fromCharCode(...bytes.subarray(start,start+length));
 if(type==='image/png'&&bytes.length>=45&&text(1,3)==='PNG'&&bytes[0]===137&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10&&view.getUint32(8)===13&&text(12,4)==='IHDR'&&text(bytes.length-8,4)==='IEND')return [view.getUint32(16),view.getUint32(20)];
 if(type==='image/webp'&&bytes.length>=30&&text(0,4)==='RIFF'&&text(8,4)==='WEBP'&&view.getUint32(4,true)+8===bytes.length){
  if(text(12,4)==='VP8X')return [1+bytes[24]!+(bytes[25]!<<8)+(bytes[26]!<<16),1+bytes[27]!+(bytes[28]!<<8)+(bytes[29]!<<16)];
  if(text(12,4)==='VP8L'&&bytes[20]===47)return [1+bytes[21]!+((bytes[22]!&63)<<8),1+(bytes[22]!>>6)+(bytes[23]!<<2)+((bytes[24]!&15)<<10)];
  if(text(12,4)==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42)return [view.getUint16(26,true)&16383,view.getUint16(28,true)&16383];
 }
 if(type==='image/jpeg'&&bytes.length>=12&&bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217){
  for(let offset=2;offset+4<bytes.length;){
   if(bytes[offset++]!==255)return null;
   while(bytes[offset]===255)offset++;
   const marker=bytes[offset++];if(marker===218||marker===217)return null;if(marker===216||marker===1)continue;
   if(offset+2>bytes.length)return null;const length=view.getUint16(offset);if(length<2||offset+length>bytes.length)return null;
   if(marker!==undefined&&[192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return length>=8?[view.getUint16(offset+5),view.getUint16(offset+3)]:null;
   offset+=length;
  }
 }
 return null;
}
