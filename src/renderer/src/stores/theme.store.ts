import {computed, ref, watch} from "vue"
import {useBroadcastChannel} from "@vueuse/core"
import {defineStore} from "pinia"

import {DEFAULT_ACCENT_ID, resolveAccentValue} from "@shared/constants/theme"
import {useSettingValue} from "@/composables/useSettingsValue"
import {BROADCAST_CHANNELS} from "@/constants/events"
import {resolveAppearanceMode} from "@/utils/theme/resolveAppearanceMode"

import type {AppearanceMode} from "@shared/types/storage"

type AppearanceSnapshot = {
  isDark: boolean
  accent: string
}

export const useThemeStore = defineStore("theme", () => {
  const {data: broadcast, post} = useBroadcastChannel<AppearanceSnapshot | null, AppearanceSnapshot | null>({
    name: BROADCAST_CHANNELS.THEME_SYNC,
  })

  const mode = useSettingValue<"appearance.mode", AppearanceMode>("appearance.mode", "system")
  const accentId = useSettingValue("appearance.accent", DEFAULT_ACCENT_ID)

  const systemPrefersDark = ref(window.matchMedia("(prefers-color-scheme: dark)").matches)

  const resolvedMode = computed(() => resolveAppearanceMode(mode.value, systemPrefersDark.value))
  const accentValue = computed(() => resolveAccentValue(accentId.value))

  function setMode(value: AppearanceMode) {
    mode.value = value
  }

  function setAccent(id: string) {
    accentId.value = id
  }

  function applySnapshot(snapshot: AppearanceSnapshot) {
    const root = document.documentElement
    root.classList.toggle("dark", snapshot.isDark)
    root.style.setProperty("--c-accent", snapshot.accent)
  }

  watch(
    [resolvedMode, accentValue],
    () => {
      const snapshot: AppearanceSnapshot = {
        isDark: resolvedMode.value === "dark",
        accent: accentValue.value,
      }
      applySnapshot(snapshot)
      post(snapshot)
    },
    {immediate: true},
  )

  watch(broadcast, (snapshot) => snapshot && applySnapshot(snapshot))

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
    systemPrefersDark.value = event.matches
  })

  return {
    mode,
    accentId,
    accentValue,
    resolvedMode,

    setMode,
    setAccent,
  }
})
