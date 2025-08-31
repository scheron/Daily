import {createApp} from "vue"
import {createPinia} from "pinia"

import FloatingVue from 'floating-vue'
// @ts-ignore
import { VOnboardingWrapper, VOnboardingStep } from 'v-onboarding'

import App from "@/App.vue"
import router from "@/router"

import "floating-vue/dist/style.css"
import "vue-sonner/style.css"
import 'v-onboarding/dist/style.css'

import "@/assets/styles/main.css"
import "@/assets/styles/rewrites/vue-sonner.css"
import "@/assets/styles/rewrites/floating-vue.css"
import "@/assets/styles/rewrites/v-onboarding.css"



const app = createApp(App)

app.use(createPinia())
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

app.component('VOnboardingWrapper', VOnboardingWrapper)
app.component('VOnboardingStep', VOnboardingStep)

app.mount("#app")
