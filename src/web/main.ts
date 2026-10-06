import { createApp } from 'vue';
import App from './App.vue';
import FieldLabel from './components/FieldLabel.vue';
import { router } from './router';
import './style.css';

createApp(App).component('FieldLabel',FieldLabel).use(router).mount('#app');
