<script setup lang="ts">
import {computed} from 'vue';
import MessageIcon from './MessageIcon.vue';
import type {LanguageReview} from '../../shared/script-language';
const props=defineProps<{review?:LanguageReview;lineId:string;number:number}>();
const emit=defineEmits<{ignore:[review:LanguageReview,issueNo:number]}>();
const issues=computed(()=>props.review?.issues.filter(i=>!i.ignored)??[]);
function focus(){document.getElementById(props.lineId)?.focus();document.getElementById('entry-'+props.lineId)?.scrollIntoView({block:'center'});}
</script>
<template><div v-if="issues.length" class="language-feedback" aria-label="语言提示"><div v-for="issue in issues" :key="review!.id+':'+issue.issue_no" class="alert warning language-warning" role="alert" :data-message-id="review!.id+':'+issue.issue_no" :data-message="'第 '+number+' 条：'+issue.problem+'；建议：'+issue.suggestion"><div class="feedback-content"><MessageIcon kind="W"/><div><a href="#" @click.prevent="focus">{{ issue.problem }}</a><p class="feedback-excerpt">“{{ issue.excerpt }}”</p><p>建议：{{ issue.suggestion }}</p></div></div><button type="button" class="text-button" @click="emit('ignore',review!,issue.issue_no)">忽略这则提示</button></div></div></template>
<style scoped>
.language-feedback{margin-top:12px}.language-warning{padding:12px;margin:0 0 10px;font-size:13px;overflow-wrap:anywhere}.feedback-content{display:flex;align-items:flex-start;gap:8px}.feedback-content :deep(.message-icon){width:20px;height:20px;flex-shrink:0}.feedback-content>div{min-width:0}.feedback-content a{font-weight:600}.feedback-content p{margin:5px 0 0}.feedback-excerpt{color:var(--muted)}.language-warning button{margin-top:6px;font-size:13px;min-height:36px}@media(max-width:760px){.language-warning button{min-height:44px}}
</style>
