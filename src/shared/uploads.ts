// Decimal 1 GB, consistently enforced by client, Worker and D1.
export const MAX_UPLOAD_SIZE=1_000_000_000;
export const UPLOAD_PART_SIZE=10*1024*1024;

export const VIDEO_ACCEPT='.mp4,.m4v,.mov,.webm,.mkv';
export function videoContentType(filename:string,type:string){
 const ext=filename.toLowerCase().split('.').pop();
 const expected=ext==='mp4'||ext==='m4v'?'video/mp4':ext==='mov'?'video/quicktime':ext==='webm'?'video/webm':ext==='mkv'?'video/x-matroska':null;
 if(!expected)return null;
 const aliases=ext==='m4v'?['video/x-m4v']:ext==='mkv'?['video/matroska']:[];
 return !type||type==='application/octet-stream'||type===expected||aliases.includes(type)?expected:null;
}
