import { createRouter, createWebHistory } from 'vue-router';
import { identity,session,api } from './lib/api';
export const router=createRouter({history:createWebHistory(),routes:[
 {path:'/',redirect:'/login'},
 {path:'/login',component:()=>import('./pages/Login.vue')},
 {path:'/wishes',component:()=>import('./pages/Wishes.vue')},
 {path:'/admin/wishes',component:()=>import('./pages/WishReview.vue')},
 {path:'/submit',component:()=>import('./pages/MySubmissions.vue')},
 {path:'/submit/:id',component:()=>import('./pages/Submit.vue')},
 {path:'/admin/submissions',component:()=>import('./pages/Submissions.vue')},
 {path:'/admin/submissions/:id',component:()=>import('./pages/Review.vue')},
 {path:'/admin/program',component:()=>import('./pages/Program.vue')},
 {path:'/admin/script',component:()=>import('./pages/Script.vue')},
 {path:'/admin/characters',component:()=>import('./pages/Characters.vue')},
 {path:'/admin/settings',component:()=>import('./pages/Settings.vue')},
 {path:'/admin/users',component:()=>import('./pages/Administrators.vue')},
 {path:'/:pathMatch(.*)*',redirect:'/submit'},
]});
router.beforeEach(async to=>{const user=await identity();if(to.path==='/login'&&session.logoutRequested)return true;if(to.path==='/login')return user?(user.role==='admin'?'/admin/submissions':'/submit'):true;if(!user)return {path:'/login',query:{next:to.fullPath}};if(to.path.startsWith('/admin')&&user.role!=='admin')return '/submit';if(to.path==='/admin/users'&&!user.is_super_admin)return '/admin/submissions';return true;});

router.beforeResolve(async to=>{if(to.path==='/login'&&session.logoutRequested){await api('/api/auth/logout',{});session.user=null;session.loaded=true;}});
