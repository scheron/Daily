import {createApp} from "vue"
import {createPinia} from "pinia"

import App from "./App.vue"

import "vue-sonner/style.css"

import "@/assets/styles/main.css"

import "@/assets/styles/rewrites/vue-sonner.css"

createApp(App).use(createPinia()).mount("#app")
