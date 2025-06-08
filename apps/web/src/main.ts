import {createApp} from "vue"
import {createPinia} from "pinia"

import App from "./App.vue"

import "@daily/assets/styles/libs"

createApp(App).use(createPinia()).mount("#app")
