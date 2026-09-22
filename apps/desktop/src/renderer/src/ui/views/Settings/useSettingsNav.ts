import {computed, onUnmounted, ref, watch} from "vue"
import {useRoute, useRouter} from "vue-router"

import {isString} from "@daily/std"

import AiSettings from "./{fragments}/AiSettings"
import DebugSettings from "./{fragments}/DebugSettings"
import DeletedTasks from "./{fragments}/DeletedTasks"
import GeneralSettings from "./{fragments}/GeneralSettings"
import ProjectsSettings from "./{fragments}/ProjectsSettings"
import SyncSettings from "./{fragments}/SyncSettings"

import type {IconName} from "@/ui/base/BaseIcon"
import type {ComponentInstance} from "vue"

export function useSettingsNav() {
  type SettingsPanel = "general" | "projects" | "sync" | "ai" | "deleted-tasks" | "debug"

  type SettingsSection = {
    id: SettingsPanel
    icon: IconName
    label: string
    component: ComponentInstance<any>
  }

  const isDevMode = import.meta.env.DEV && import.meta.env.MODE === "development"

  const sections: SettingsSection[] = [
    {id: "general", icon: "cog", label: "General", component: GeneralSettings},
    {id: "projects", icon: "monitor", label: "Projects", component: ProjectsSettings},
    {id: "sync", icon: "cloud", label: "Sync", component: SyncSettings},
    {id: "ai", icon: "ai", label: "AI", component: AiSettings},
    {id: "deleted-tasks", icon: "trash", label: "Deleted Tasks", component: DeletedTasks},
    ...(isDevMode ? [{id: "debug", icon: "code", label: "DEBUG", component: DebugSettings} as SettingsSection] : []),
  ]
  const sectionIds = new Set<SettingsPanel>(sections.map((s) => s.id))

  const route = useRoute()
  const router = useRouter()

  const initialSection =
    isString(route.query.section) && sectionIds.has(route.query.section as SettingsPanel) ? (route.query.section as SettingsPanel) : "general"

  const activeNav = ref<SettingsPanel>(initialSection)
  const activeSection = computed(() => sections.find((s) => s.id === activeNav.value) ?? sections[0])

  const unsubscribeNavigate = window.BridgeIPC.on("settings:navigate", (section: SettingsPanel) => {
    if (sectionIds.has(section)) {
      activeNav.value = section
    }
  })

  watch(activeNav, (section) => {
    router.replace({query: {section}})
  })

  onUnmounted(() => {
    unsubscribeNavigate()
  })

  return {
    sections,
    activeNav,
    activeSection,
  }
}
