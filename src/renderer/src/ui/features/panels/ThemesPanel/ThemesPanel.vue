<script setup lang="ts">
import {computed} from "vue"
import {useThemeStore} from "@/stores/theme.store"

import BaseIcon from "@/ui/base/BaseIcon"

import Preview from "./fragments/Preview.vue"

const themeStore = useThemeStore()

const lightThemes = computed(() => themeStore.themes.filter((theme) => theme.type === "light"))
const darkThemes = computed(() => themeStore.themes.filter((theme) => theme.type === "dark"))

function setCurrentTheme(themeId: string) {
  themeStore.setCurrentTheme(themeId)
  themeStore.toggleSystemTheme(false)
}

function setPreferredLightTheme(event: Event) {
  const select = event.target as HTMLSelectElement
  themeStore.setPreferredTheme("light", select.value)
}

function setPreferredDarkTheme(event: Event) {
  const select = event.target as HTMLSelectElement
  themeStore.setPreferredTheme("dark", select.value)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-2">
      <div class="text-base-content flex items-center gap-1 text-xs font-bold select-none">
        <BaseIcon name="background" class="size-4" />
        Light Mode
      </div>
      <div class="flex gap-3 overflow-x-auto overscroll-none py-3">
        <Preview
          v-for="theme in lightThemes"
          :key="theme.id"
          :theme="theme"
          :system-enabled="Boolean(themeStore.isSystemThemeEnabled)"
          :selected="theme.id === themeStore.currentTheme.id"
          :preferred="theme.id === themeStore.preferredLightTheme?.id"
          @click="setCurrentTheme(theme.id)"
        />
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <div class="text-base-content flex items-center gap-1 text-xs font-bold select-none">
        <BaseIcon name="background" class="size-4" />
        Dark Mode
      </div>
      <div class="flex gap-3 overflow-x-auto overscroll-none py-3">
        <Preview
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
      <button
        class="bg-base-200 hover:bg-base-300 text-base-content flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        :class="{
          'border-accent border': themeStore.isSystemThemeEnabled,
          'border-base-300 border': !themeStore.isSystemThemeEnabled,
        }"
        @click="themeStore.toggleSystemTheme()"
      >
        <BaseIcon name="monitor" class="size-4" />
        {{ themeStore.isSystemThemeEnabled ? "System Sync Enabled" : "Sync with System Theme" }}
      </button>

      <div v-if="themeStore.isSystemThemeEnabled" class="border-base-300 flex flex-col gap-4 rounded-lg border p-4">
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
    </div>
  </div>
</template>
