import {AppError} from './core';

// Inspect container metadata and a video track using bounded R2 range reads.
// Never buffer the media payload or trust an extension/MIME declaration alone.
export async function verifyVideo(bucket:R2Bucket,key:string,size:number,type:string){
 const fail=()=>{throw new AppError(422,'文件必须是包含视频画面的 MP4、MOV、WebM 或 MKV，不能上传音频或普通附件');};
 let cachedStart=-1,cached=new Uint8Array(),reads=0,elements=0;
 const read=async(offset:number,length:number)=>{
  if(!Number.isSafeInteger(offset)||offset<0||length<0||offset+length>size||length>65536)fail();
  if(offset<cachedStart||offset+length>cachedStart+cached.length){
   if(++reads>48)throw new AppError(422,'视频元数据过于复杂，请重新导出视频后上传');
   cachedStart=offset;const object=await bucket.get(key,{range:{offset,length:Math.min(65536,size-offset)}});if(!object)fail();
   cached=new Uint8Array(await object!.arrayBuffer());
  }
  if(offset+length>cachedStart+cached.length)fail();
  return cached.slice(offset-cachedStart,offset-cachedStart+length);
 };
 const text=(bytes:Uint8Array)=>new TextDecoder().decode(bytes);
 const count=()=>{if(++elements>1024)throw new AppError(422,'视频元数据过于复杂，请重新导出视频后上传');};
 if(type==='video/mp4'||type==='video/quicktime'){
  const box=async(at:number,end:number)=>{
   count();if(end-at<8)fail();const bytes=await read(at,Math.min(16,end-at)),view=new DataView(bytes.buffer);
   let length=view.getUint32(0),header=8;
   if(length===1){if(bytes.length<16)fail();const big=view.getBigUint64(8);if(big>BigInt(size))fail();length=Number(big);header=16;}
   else if(length===0)length=end-at;
   if(length<header||at+length>end)fail();return {kind:text(bytes.slice(4,8)),body:at+header,end:at+length};
  };
  const hasVideo=async(start:number,end:number,level=0):Promise<boolean>=>{
   let found=false;for(let at=start;at<end;){const b=await box(at,end);
    if((level===0&&b.kind==='trak')||(level===1&&b.kind==='mdia'))found=await hasVideo(b.body,b.end,level+1)||found;
    if(level===2&&b.kind==='hdlr'){if(b.end-b.body<12)fail();found=text(await read(b.body+8,4))==='vide'||found;}
    at=b.end;
   }return found;
  };
  let video=false,media=false,format=false;
  for(let at=0;at<size;){const b=await box(at,size);
   if(at===0&&!['ftyp','wide','free','moov','mdat'].includes(b.kind))fail();
   if(b.kind==='ftyp'){if(b.end-b.body<8)fail();format=true;}
   if(b.kind==='moov')video=await hasVideo(b.body,b.end)||video;
   if(b.kind==='mdat'&&b.end>b.body)media=true;
   at=b.end;
  }
  if(!video||!media||(type==='video/mp4'&&!format))fail();
  return type==='video/mp4'?'mp4':'quicktime';
 }
 const element=async(at:number,end:number,allowUnknown=false)=>{
  count();const bytes=await read(at,Math.min(12,end-at));
  const vint=(offset:number,max:number,retain=false)=>{
   const first=bytes[offset];if(!first)fail();let width=1,mask=128;while(!(first!&mask)){width++;mask>>=1;}
   if(width>max||offset+width>bytes.length)fail();let value=BigInt(retain?first!:first!&(mask-1)),unknown=(first!&(mask-1))===mask-1;
   for(let i=1;i<width;i++){value=(value<<8n)|BigInt(bytes[offset+i]!);unknown=unknown&&bytes[offset+i]===255;}
   return {width,value,unknown:!retain&&unknown};
  };
  const id=vint(0,4,true),length=vint(id.width,8),body=at+id.width+length.width;
  if(length.unknown&&!allowUnknown)fail();if(!length.unknown&&length.value>BigInt(end-body))fail();
  return {id:Number(id.value),body,end:length.unknown?end:body+Number(length.value),unknown:length.unknown};
 };
 const header=await element(0,size);if(header.id!==0x1a45dfa3)fail();let doctype='';
 for(let at=header.body;at<header.end;){const e=await element(at,header.end);if(e.id===0x4282){if(e.end-e.body>16)fail();doctype=text(await read(e.body,e.end-e.body));}at=e.end;}
 if(doctype!==(type==='video/webm'?'webm':'matroska'))fail();
 const segment=await element(header.end,size,true);if(segment.id!==0x18538067)fail();let video=false;
 for(let at=segment.body;at<segment.end;){const e=await element(at,segment.end,true);
  if(e.id===0x1f43b675){if(!video||e.end<=e.body)fail();return type==='video/webm'?'webm':'matroska';}
  if(e.unknown)fail();
  if(e.id===0x1654ae6b){for(let pos=e.body;pos<e.end;){const track=await element(pos,e.end);if(track.id===0xae){let trackType=0,codec='';
   for(let p=track.body;p<track.end;){const field=await element(p,track.end);if(field.id===0x83){if(field.end-field.body!==1)fail();trackType=(await read(field.body,1))[0]!;}if(field.id===0x86){if(field.end-field.body>100)fail();codec=text(await read(field.body,field.end-field.body));}p=field.end;}
   video=video||(trackType===1&&codec.startsWith('V_'));
  }pos=track.end;}}
  at=e.end;
 }
 return fail();
}
