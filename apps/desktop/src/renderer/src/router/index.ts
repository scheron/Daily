import {createRouter, createWebHashHistory} from "vue-router"

import type {RouteRecordRaw} from "vue-router"

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    name: "MainApp",
    component: () => import("@/ui/views/Main"),
  },
  {
    path: "/settings",
    name: "Settings",
    component: () => import("@/ui/views/Settings"),
  },
  {
    path: "/assistant",
    name: "Assistant",
    component: () => import("@/ui/views/Assistant"),
  },
  {
    path: "/focus",
    name: "Focus",
    component: () => import("@/ui/views/Focus.vue"),
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/",
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
