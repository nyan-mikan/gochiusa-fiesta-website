/** Decimal units match the published 1,000,000,000-byte work limit. */
export function formatFileSize(bytes:number):string {
 if(!Number.isFinite(bytes)||bytes<0)return '—';
 const units=['B','KB','MB','GB'];let index=0;
 while(bytes>=1000&&index<units.length-1){bytes/=1000;index++;}
 return `${index?Number(bytes.toFixed(2)):Math.round(bytes)} ${units[index]}`;
}
