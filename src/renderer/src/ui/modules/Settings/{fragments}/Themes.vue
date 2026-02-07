<script setup lang="ts">
import {computed} from "vue"

import {useThemeStore} from "@/stores/theme.store"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseSwitch from "@/ui/base/BaseSwitch.vue"
import BlockUI from "@/ui/common/misc/BlockUI.vue"

import ThemesPreview from "./ThemesPreview.vue"

const themeStore = useThemeStore()

const lightThemes = computed(() => themeStore.themes.filter((theme) => theme.type === "light"))
const darkThemes = computed(() => themeStore.themes.filter((theme) => theme.type === "dark"))

function setCurrentTheme(themeId: string) {
  themeStore.setCurrentTheme(themeId)
  themeStore.toggleSystemTheme(false)
}

function setPreferredLightTheme(event: Event) {
  if (themeStore.isGlassUIEnabled) return
  const select = event.target as HTMLSelectElement
  themeStore.setPreferredTheme("light", select.value)
}

function setPreferredDarkTheme(event: Event) {
  const select = event.target as HTMLSelectElement
  themeStore.setPreferredTheme("dark", select.value)
}
</script>

<template>
  <div class="flex flex-col gap-4 pb-8">
    <div class="border-base-300 bg-base-200/60 flex items-start justify-between gap-2 rounded-lg border p-3">
      <div>
        <p class="text-base-content flex items-center gap-2 text-sm">
          <span>Glass UI</span>
          <span
            class="text-base-content/65 border-base-content/25 inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase"
          >
            Beta
          </span>
        </p>
        <p class="text-base-content/60 text-xs">Frosted glass mode for dark themes. Not available with light themes.</p>
      </div>
      <BaseSwitch :model-value="themeStore.isGlassUIEnabled" @update:model-value="themeStore.toggleGlassUI($event)" />
    </div>

    <div class="flex flex-col gap-2">
      <div class="text-base-content flex items-center gap-1 text-xs font-bold select-none">
        <BaseIcon name="background" class="size-4" />
        Light Mode
      </div>
      <div v-if="themeStore.isGlassUIEnabled" class="text-base-content/60 border-base-300 bg-base-200/50 rounded-md border px-3 py-2 text-xs">
        Light themes are disabled while Glass UI is enabled.
      </div>
      <div class="flex gap-3 overflow-x-auto overscroll-none py-3">
        <BlockUI :block="themeStore.isGlassUIEnabled">
          <div class="flex gap-3">
            <ThemesPreview
              v-for="theme in lightThemes"
              :key="theme.id"
              :theme="theme"
              :system-enabled="Boolean(themeStore.isSystemThemeEnabled)"
              :selected="theme.id === themeStore.currentTheme.id"
              :preferred="theme.id === themeStore.preferredLightTheme?.id"
              @click="setCurrentTheme(theme.id)"
            />
          </div>
        </BlockUI>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <div class="text-base-content flex items-center gap-1 text-xs font-bold select-none">
        <BaseIcon name="background" class="size-4" />
        Dark Mode
      </div>
      <div class="flex gap-3 overflow-x-auto overscroll-none py-3">
        <ThemesPreview
          v-for="theme in darkThemes"
          :key="theme.id"
          :theme="theme"
          :system-enabled="Boolean(themeStore.isSystemThemeEnabled)"
          :selected="theme.id === themeStore.currentTheme.id"
          :preferred="theme.id === themeStore.preferredDarkTheme?.id"
          @click="setCurrentTheme(theme.id)"
        />
      </div>
    </div>

    <div class="flex flex-col gap-4">
      <BaseButton
        variant="secondary"
        size="sm"
        icon="monitor"
        :disabled="themeStore.isGlassUIEnabled"
        :class="{
          'border-accent border': themeStore.isSystemThemeEnabled,
          'border-base-300 border': !themeStore.isSystemThemeEnabled,
        }"
        @click="themeStore.toggleSystemTheme()"
      >
        {{
          themeStore.isGlassUIEnabled
            ? "System Sync Disabled in Glass UI"
            : themeStore.isSystemThemeEnabled
              ? "System Sync Enabled"
              : "Sync with System Theme"
        }}
      </BaseButton>

      <BlockUI :block="!themeStore.isSystemThemeEnabled || themeStore.isGlassUIEnabled">
        <div class="border-base-300 flex flex-col gap-4 rounded-lg border p-4">
          <div class="flex flex-col gap-1.5">
            <div class="text-base-content/70 flex items-center gap-1 text-xs">
              <BaseIcon name="star" class="size-4" />
              Preferred light theme:
            </div>
            <select
              class="text-base-content bg-base-100 border-base-300 hover:border-accent focus:border-accent w-full rounded-md border px-2 py-1.5 text-sm transition-colors outline-none select-none"
              :value="themeStore.preferredLightTheme?.id"
              @change="setPreferredLightTheme"
            >
              <option v-for="theme in themeStore.themes" :key="theme.id" :value="theme.id">
                {{ theme.name }}
              </option>
            </select>
          </div>

          <div class="flex flex-col gap-1.5">
            <div class="text-base-content/70 flex items-center gap-1 text-xs">
              <BaseIcon name="star" class="size-4" />
              Preferred dark theme:
            </div>
            <select
              class="text-base-content bg-base-100 border-base-300 hover:border-accent focus:border-accent w-full rounded-md border px-2 py-1.5 text-sm transition-colors outline-none select-none"
              :value="themeStore.preferredDarkTheme?.id"
              @change="setPreferredDarkTheme"
            >
              <option v-for="theme in darkThemes" :key="theme.id" :value="theme.id">
                {{ theme.name }}
              </option>
            </select>
          </div>
        </div>
      </BlockUI>
    </div>
  </div>
</template>
