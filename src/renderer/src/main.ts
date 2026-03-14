import { useSettingsStore } from "@/stores/settings.store"
import { createPinia } from "pinia"
import { createApp } from "vue"

import App from "@/App.vue"
import router from "@/router"

import vFocusOnMount from "@/directives/vFocusOnMount"

import "vue-sonner/style.css"
import "vue-toasts-lite/style.css"

import "@/assets/styles/main.css"
import "@/assets/styles/tooltip.css"
import "@/assets/styles/rewrites/vue-sonner.css"
import "@/assets/styles/rewrites/vue-toasts-lite.css"
import "@/assets/styles/rewrites/vue-draggable.css"
import vTooltip from "./directives/vTooltip"

async function initApp() {
  const pinia = createPinia()
  const app = createApp(App)

  app.use(pinia)
  app.use(router)

  useSettingsStore()
  app.directive("focus-on-mount", vFocusOnMount)
  app.directive("tooltip", vTooltip)
  app.mount("#app")
}

initApp()
