import {computed, ref, watch} from "vue"
import {useBroadcastChannel, watchOnce} from "@vueuse/core"
import {useSettingValue} from "@/composables/useSettingsValue"
import {BROADCAST_CHANNELS} from "@/constants/events"
import * as _themes from "@/constants/themes"
import {defineStore} from "pinia"

import type {Theme} from "@/types/theme"

export const useThemeStore = defineStore("theme", () => {
  const {data: broadcastTheme, post: postTheme} = useBroadcastChannel<Theme["id"] | null, Theme["id"] | null>({
    name: BROADCAST_CHANNELS.THEME_SYNC,
  })

  const themes = ref<Theme[]>(Object.values(_themes))

  const currentThemeId = useSettingValue("themes.current", themes.value[8].id)
  const preferredLightThemeId = useSettingValue("themes.preferredLight", "aurora-light")
  const preferredDarkThemeId = useSettingValue("themes.preferredDark", "aurora")
  const isSystemThemeEnabled = useSettingValue("themes.useSystem", false)

  const currentTheme = computed<Theme>(() => themes.value.find(({id}) => id === currentThemeId.value) ?? themes.value[0])
  const preferredLightTheme = computed<Theme | null>(() => themes.value.find(({id}) => id === preferredLightThemeId.value) ?? null)
  const preferredDarkTheme = computed<Theme | null>(() => themes.value.find(({id}) => id === preferredDarkThemeId.value) ?? null)

  function setCurrentTheme(themeId: Theme["id"]) {
    currentThemeId.value = themeId
  }

  function setPreferredTheme(type: "light" | "dark", themeId: Theme["id"] | null) {
    if (!themeId) return

    const theme = themes.value.find(({id}) => id === themeId)
    if (!theme) return

    if (type === "light") {
      preferredLightThemeId.value = themeId
      if (isSystemThemeEnabled.value && !isCurrentSystemDark()) setCurrentTheme(themeId)
    } else {
      preferredDarkThemeId.value = themeId
      if (isSystemThemeEnabled.value && isCurrentSystemDark()) setCurrentTheme(themeId)
    }
  }

  function isCurrentSystemDark() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
  }

  function toggleSystemTheme(value?: boolean) {
    isSystemThemeEnabled.value = value ?? !isSystemThemeEnabled.value
    if (isSystemThemeEnabled.value) applySystemTheme()
  }

  function applySystemTheme() {
    if (isCurrentSystemDark()) setCurrentTheme(preferredDarkTheme.value?.id ?? themes.value[0].id)
    else setCurrentTheme(preferredLightTheme.value?.id ?? themes.value[0].id)
  }

  function applyThemeToDOM(themeId: Theme["id"]) {
    const root = document.documentElement
    const theme = themes.value.find((t) => t.id === themeId)

    root.classList.remove(...themes.value.map((t) => t.id))
    root.classList.add(themeId)

    Object.entries(theme?.colorScheme ?? {}).forEach(([key, value]) => root.style.setProperty(`--c-${key}`, value))
  }

  watch(
    currentTheme,
    (theme) => {
      applyThemeToDOM(theme.id)
      postTheme(theme.id)
    },
    {immediate: true},
  )
  watch(broadcastTheme, (themeId) => themeId && applyThemeToDOM(themeId))

  watchOnce(isSystemThemeEnabled, (value) => value && applySystemTheme())

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (isSystemThemeEnabled.value) applySystemTheme()
  })

  return {
    currentTheme,
    isSystemThemeEnabled,
    preferredLightTheme,
    preferredDarkTheme,
    themes,

    setCurrentTheme,
    setPreferredTheme,
    toggleSystemTheme,
  }
})
