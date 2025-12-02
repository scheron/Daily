import {createRouter, createWebHashHistory} from "vue-router"

import type {RouteRecordRaw} from "vue-router"

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    name: "MainApp",
    component: () => import("@/ui/views/Main"),
  },
  {
    path: "/db-viewer",
    name: "DBViewer",
    component: () => import("@/ui/views/DBViewer"),
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
