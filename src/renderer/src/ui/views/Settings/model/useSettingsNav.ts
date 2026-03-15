import {computed, onUnmounted, ref, watch} from "vue"
import {useRoute, useRouter} from "vue-router"

import {SECTION_IDS, SECTIONS} from "./constants"

import type {SettingsPanel} from "@/types/common"

export function useSettingsNav() {
  const route = useRoute()
  const router = useRouter()

  const initialSection =
    typeof route.query.section === "string" && SECTION_IDS.has(route.query.section as SettingsPanel)
      ? (route.query.section as SettingsPanel)
      : "appearance"

  const activeNav = ref<SettingsPanel>(initialSection)
  const activeSection = computed(() => SECTIONS.find((s) => s.id === activeNav.value) ?? SECTIONS[0])

  watch(activeNav, (section) => {
    router.replace({query: {section}})
  })

  const unsubscribeNavigate = window.BridgeIPC.on("settings:navigate", (section: SettingsPanel) => {
    if (SECTION_IDS.has(section)) {
      activeNav.value = section
    }
  })

  onUnmounted(() => {
    unsubscribeNavigate()
  })

  return {
    sections: SECTIONS,
    activeNav,
    activeSection,
  }
}
