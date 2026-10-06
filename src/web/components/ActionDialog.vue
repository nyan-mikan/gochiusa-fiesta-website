<script setup lang="ts">
import ModalDialog from './ModalDialog.vue';import {actionDialog,finishDialog} from '../lib/dialog';
</script>
<template><ModalDialog v-if="actionDialog.open" :title="actionDialog.message" @close="finishDialog(null)"><form @submit.prevent="finishDialog(actionDialog.prompt?actionDialog.value:'confirmed')"><FieldLabel v-if="actionDialog.prompt">原因<textarea v-model="actionDialog.value" rows="3" required maxlength="1000"></textarea></FieldLabel><div class="inline"><button type="button" @click="finishDialog(null)">取消</button><button class="primary">确认</button></div></form></ModalDialog></template>
