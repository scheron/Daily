import {computed, ref, watch} from "vue"
import {useBroadcastChannel} from "@vueuse/core"
import {defineStore} from "pinia"

import {useSettingValue} from "@/composables/useSettingsValue"
import {BROADCAST_CHANNELS} from "@/constants/events"
import * as _themes from "@/constants/themes"

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
  const isGlassUIEnabled = useSettingValue("themes.glassUI", false)

  const currentTheme = computed<Theme>(() => themes.value.find(({id}) => id === currentThemeId.value) ?? themes.value[0])
  const preferredLightTheme = computed<Theme | null>(() => themes.value.find(({id}) => id === preferredLightThemeId.value) ?? null)
  const preferredDarkTheme = computed<Theme | null>(() => themes.value.find(({id}) => id === preferredDarkThemeId.value) ?? null)
  const darkThemes = computed<Theme[]>(() => themes.value.filter((theme) => theme.type === "dark"))

  function getFallbackDarkThemeId(): Theme["id"] {
    return preferredDarkTheme.value?.id ?? darkThemes.value[0]?.id ?? themes.value[0].id
  }

  function setCurrentTheme(themeId: Theme["id"]) {
    const nextTheme = themes.value.find(({id}) => id === themeId)
    if (isGlassUIEnabled.value && nextTheme?.type === "light") {
      currentThemeId.value = getFallbackDarkThemeId()
      return
    }
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
    root.classList.toggle("glass-ui", Boolean(isGlassUIEnabled.value))

    Object.entries(theme?.colorScheme ?? {}).forEach(([key, value]) => root.style.setProperty(`--c-${key}`, value))
  }

  function toggleGlassUI(value?: boolean) {
    isGlassUIEnabled.value = value ?? !isGlassUIEnabled.value
    document.documentElement.classList.toggle("glass-ui", Boolean(isGlassUIEnabled.value))
    if (isGlassUIEnabled.value) enforceGlassThemeMode()
  }

  function enforceGlassThemeMode() {
    isSystemThemeEnabled.value = false
    if (currentTheme.value.type === "light") setCurrentTheme(getFallbackDarkThemeId())
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
  watch(
    isGlassUIEnabled,
    (value) => {
      document.documentElement.classList.toggle("glass-ui", Boolean(value))
      if (value) enforceGlassThemeMode()
    },
    {immediate: true},
  )

  watch(isSystemThemeEnabled, (value) => value && applySystemTheme(), {immediate: true})

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (isSystemThemeEnabled.value) applySystemTheme()
  })

  return {
    currentTheme,
    isSystemThemeEnabled,
    preferredLightTheme,
    preferredDarkTheme,
    isGlassUIEnabled,
    themes,

    setCurrentTheme,
    setPreferredTheme,
    toggleSystemTheme,
    toggleGlassUI,
  }
})
