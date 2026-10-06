import { createApp } from 'vue';
import App from './App.vue';
import FieldLabel from './components/FieldLabel.vue';
import PageActions from './components/PageActions.vue';
import { router } from './router';
import './style.css';

createApp(App).component('FieldLabel',FieldLabel).component('PageActions',PageActions).use(router).mount('#app');
