import {readFileSync} from 'node:fs';
export const videoFixture=name=>readFileSync(new URL('./fixtures/video/'+name,import.meta.url));
export function videoMp4(size){
 const original=videoFixture('black.mp4');if(size===undefined||size===original.length)return original;
 if(size<original.length+8)throw Error('Fixture size too small');
 const data=Buffer.alloc(size,65);original.copy(data);data.writeUInt32BE(size-original.length,original.length);data.write('free',original.length+4);return data;
}
