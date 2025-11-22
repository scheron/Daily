import { createPinia } from "pinia"
import { createApp } from "vue"
import { useSettingsStore } from "@/stores/settings.store"

import FloatingVue from 'floating-vue'

import App from "@/App.vue"
import router from "@/router"

import "floating-vue/dist/style.css"
import "vue-sonner/style.css"

import "@/assets/styles/main.css"
import "@/assets/styles/rewrites/floating-vue.css"
import "@/assets/styles/rewrites/vue-sonner.css"

async function initApp() {
  const pinia = createPinia()
  const app = createApp(App)

  app.use(pinia)
  app.use(router)
  app.use(FloatingVue, {
    themes: {
      tooltip: {
        placement: "bottom-end",
        triggers: ['hover'],
        distance: 8,
        delay: {
          show: 1000,
          hide: 200,
        },
        html: true,
        loadingContent: "...",
      },
    },
  })

  useSettingsStore()

  app.mount("#app")
}

initApp()
