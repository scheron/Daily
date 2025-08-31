import {createApp} from "vue"
import {createPinia} from "pinia"

import FloatingVue from 'floating-vue'

import App from "@/App.vue"
import router from "@/router"


import "floating-vue/dist/style.css"
import "vue-sonner/style.css"

import "@/assets/styles/main.css"
import "@/assets/styles/rewrites/vue-sonner.css"
import "@/assets/styles/rewrites/floating-vue.css"
import "@/assets/styles/rewrites/tour.css"



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

app.mount("#app")
