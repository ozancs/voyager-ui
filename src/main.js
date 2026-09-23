import '@fontsource/onest/400.css'
import '@fontsource/onest/500.css'
import '@fontsource/onest/600.css'
import '@fontsource/onest/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { start } from './store'
start()
createApp(App).mount('#app')
