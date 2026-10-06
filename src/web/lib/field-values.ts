export type ValueChoice={key:string;code:string;name:string;disabled:boolean;selected:boolean};
export type FieldValues={choices:ValueChoice[];codeLabel:string;nameLabel:string};
export function fieldValues(name:string,node:HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement|null):FieldValues{
 const result:FieldValues={choices:[],codeLabel:'编号',nameLabel:name};
 if(node instanceof HTMLSelectElement){result.choices=Array.from(node.options).map((o,index)=>({key:JSON.stringify([o.value,index]),code:o.dataset.code??(o.value&&o.value.length<=24?o.value:String(index).padStart(2,'0')),name:o.textContent?.trim()||'不选择',disabled:o.disabled||o.parentElement instanceof HTMLOptGroupElement&&o.parentElement.disabled,selected:o.selected}));}
 else if(node instanceof HTMLInputElement){
  if(node.type==='number'&&node.min!==''&&node.max!==''){
   const min=Number(node.min),max=Number(node.max),step=Number(node.step||1);
   if(Number.isInteger(min)&&Number.isInteger(max)&&step===1&&max>=min&&max-min<=250){result.codeLabel=/年份/.test(name)?'年份':'数值';result.nameLabel=/年份/.test(name)?'年份说明':name;result.choices=Array.from({length:max-min+1},(_,i)=>{const value=String(min+i);return {key:value,code:value,name:/年份/.test(name)?value+' 年':value,disabled:false,selected:node.value===value};});}
  }else if(/^时区$/.test(name)){
   const values=new Set(['UTC',...Intl.supportedValuesOf('timeZone')]);
   if(node.value){try{new Intl.DateTimeFormat('zh-CN',{timeZone:node.value});values.add(node.value);}catch{/* Invalid text is not a candidate. */}}
   result.codeLabel='时区编号';result.nameLabel='时区说明';
   result.choices=Array.from(values).sort().map(value=>({key:value,code:value,name:(value.split('/').at(-1)??value).replaceAll('_',' ')+' · '+new Intl.DateTimeFormat('zh-CN',{timeZone:value,timeZoneName:'longOffset'}).formatToParts(new Date()).find(p=>p.type==='timeZoneName')!.value,disabled:false,selected:node.value===value}));
  }else if(node.type==='checkbox'){
   result.codeLabel='值';result.nameLabel=name;result.choices=[{key:'true',code:'✓',name:'勾选',disabled:false,selected:node.checked},{key:'false',code:'—',name:'不勾选',disabled:false,selected:!node.checked}];
  }else if(node.list){result.choices=Array.from(node.list.options).map(o=>({key:o.value,code:o.value,name:o.label||o.value,disabled:o.disabled,selected:node.value===o.value}));}
 }
 return result;
}
