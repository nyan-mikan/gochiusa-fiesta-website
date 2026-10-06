export const modules=[
 {id:'review',name:'投稿审核',path:'/admin/submissions',description:'审核投稿与处理通知'},
 {id:'program',name:'节目编排',path:'/admin/program',description:'编排节目、锁定与导出节目单'},
 {id:'script',name:'主持稿',path:'/admin/script',description:'编辑、定稿与导出台词'},
 {id:'characters',name:'角色管理',path:'/admin/characters',description:'维护角色、颜色与角色列表'},
 {id:'dictionary',name:'分区与职务',path:'/admin/dictionary',description:'维护 B站分区和职务字典版本'},
 {id:'settings',name:'活动设置',path:'/admin/settings',description:'维护活动时间与投稿开关'},
 {id:'wishes',name:'祝福语管理',path:'/admin/wishes',description:'收集祝福语、管理音频与导出'},
] as const;
export type ModuleId=typeof modules[number]['id'];
export const moduleIds=modules.map(m=>m.id);
export function canAccess(user:{role:string;is_super_admin:boolean;modules?:ModuleId[]}|null,scope:ModuleId){return !!user&&user.role==='admin'&&(user.is_super_admin||!!user.modules?.includes(scope));}
export function moduleForPath(path:string):ModuleId|'collaboration'|null{
 if(/^\/api\/admin\/users/.test(path)||/^\/admin\/(users|apps)(\/|$)/.test(path))return null;
 if(path.includes('bili-role-config')||/^\/admin\/dictionary/.test(path))return 'dictionary';
 if(/\/realtime$|\/changes$/.test(path))return 'collaboration';
 if(/\/(characters)(\/|$)/.test(path))return 'characters';
 if(/\/script(\/|$)/.test(path))return 'script';
 if(/\/program(\/|$)/.test(path))return 'program';
 if(/\/wishes(\/|$)/.test(path))return 'wishes';
 if(/\/(submissions|notifications)(\/|$)/.test(path))return 'review';
 if(/\/settings(\/|$)|^\/api\/admin\/events(\/|$)/.test(path))return 'settings';
 return null;
}

export function moduleForChange(type:string):ModuleId{return type.startsWith('program.')?'program':type.startsWith('character.')||type.startsWith('list.')?'characters':'script';}
