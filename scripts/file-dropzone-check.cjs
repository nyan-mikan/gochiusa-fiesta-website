const {createRequire}=require('node:module');const req=createRequire(process.cwd()+'/package.json');const {readFileSync}=require('node:fs');const {parse,compileScript}=req('@vue/compiler-sfc');const ts=req('typescript');const assert=require('node:assert/strict');
const source=readFileSync('src/web/components/FileDropzone.vue','utf8');const compiled=compileScript(parse(source).descriptor,{id:'test'});const js=ts.transpileModule(compiled.content,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const exportsObject={};new Function('require','exports',js)((id)=>id==='vue'?{...req('vue'),useId:()=> 'test',watch:()=>{}}:req(id),exportsObject);
const props={label:'test',hint:'',disabled:false,accept:'audio/*,.mp3,.wav'};const emitted=[];const state=exportsObject.default.setup(props,{expose:()=>{},emit:(...args)=>emitted.push(args)});
const audio=new File(['audio'],'voice.wav',{type:'audio/wav'}),video=new File(['video'],'video.mp4',{type:'video/mp4'});let checks=0;
function check(condition){assert.ok(condition);checks++;}
state.drop({dataTransfer:{items:[],files:[audio]}});check(emitted.length===1&&emitted[0][1]===audio);
state.drop({dataTransfer:{items:[],files:[audio,audio]}});check(emitted.length===1&&state.error.value.includes('一个'));
state.drop({dataTransfer:{items:[],files:[video]}});check(emitted.length===1&&state.error.value.includes('格式'));
state.drop({dataTransfer:{items:[{webkitGetAsEntry:()=>({isDirectory:true})}],files:[]}});check(state.error.value.includes('文件夹'));
props.disabled=true;state.drop({dataTransfer:{items:[],files:[audio]}});check(emitted.length===1);
const event={dataTransfer:{types:['Files'],dropEffect:''}};state.enter(event);check(state.depth.value===0);state.over(event);check(event.dataTransfer.dropEffect==='none');
props.disabled=false;state.enter(event);check(state.depth.value===1);state.over(event);check(event.dataTransfer.dropEffect==='copy');state.drop({dataTransfer:{items:[],files:[audio]}});check(state.depth.value===0&&emitted.length===2);
const input={files:[audio],value:'test'};state.choose({target:input});check(input.value===''&&emitted.length===3);state.choose({target:{files:[],value:''}});check(emitted.length===3);
props.accept=undefined;state.select([video]);check(emitted.at(-1)[1]===video);console.log(checks+' drop/chooser checks passed');
