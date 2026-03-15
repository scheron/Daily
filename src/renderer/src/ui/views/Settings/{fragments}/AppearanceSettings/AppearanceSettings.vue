<script setup lang="ts">
import {computed} from "vue"

import {useThemeStore} from "@/stores/theme.store"
import {useUIStore} from "@/stores/ui.store"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseCard from "@/ui/base/BaseCard.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseSwitch from "@/ui/base/BaseSwitch.vue"
import BlockUI from "@/ui/common/misc/BlockUI.vue"

import LayoutPreview from "./{fragments}/LayoutPreview.vue"
import ThemesPreview from "./{fragments}/ThemesPreview.vue"

import type {LayoutType} from "@shared/types/storage"

const uiStore = useUIStore()
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

const layoutOptions = computed<{label: string; value: LayoutType}[]>(() => [
  {label: "List", value: "list"},
  {label: "Board", value: "columns"},
])

function onSelectLayout(type: LayoutType) {
  uiStore.setTasksViewMode(type)
}
</script>

<template>
  <div>
    <h3 class="text-base-content mb-4 flex items-center gap-2 text-sm font-semibold">
      <BaseIcon name="layout" class="text-accent size-4" />
      Layout
    </h3>

    <div class="grid grid-cols-2 gap-4">
      <div class="flex w-full gap-3">
        <LayoutPreview
          v-for="option in layoutOptions"
          :key="option.value"
          :type="option.value"
          :label="option.label"
          :selected="uiStore.tasksViewMode === option.value"
          @click="onSelectLayout(option.value)"
        />
      </div>

      <BlockUI :block="uiStore.tasksViewMode !== 'columns'">
        <div class="flex w-full flex-1 flex-col gap-2">
          <BaseCard title="Auto-hide empty columns" description="Hide columns that have no tasks">
            <BaseSwitch :model-value="uiStore.columnsHideEmpty" @update:model-value="uiStore.toggleColumnsHideEmpty($event)" />
          </BaseCard>
          <BaseCard title="Auto-collapse empty columns" description="Collapse columns that have no tasks">
            <BaseSwitch :model-value="uiStore.columnsAutoCollapseEmpty" @update:model-value="uiStore.toggleColumnsAutoCollapseEmpty($event)" />
          </BaseCard>
        </div>
      </BlockUI>
    </div>

    <h3 class="text-base-content mt-8 mb-4 flex items-center gap-2 text-sm font-semibold">
      <BaseIcon name="background" class="text-accent size-4" />
      Theme
    </h3>

    <div class="flex flex-col gap-4 pb-8">
      <BaseCard title="Glass UI" description="Frosted glass mode for dark themes. Not available with light themes." badge="Beta">
        <BaseSwitch :model-value="themeStore.isGlassUIEnabled" @update:model-value="themeStore.toggleGlassUI($event)" />
      </BaseCard>

      <div class="flex flex-col gap-2">
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
          class="h-8 p-0"
          :disabled="themeStore.isGlassUIEnabled"
          :class="{
            'border-accent border': themeStore.isSystemThemeEnabled,
            'border-base-300 border': !themeStore.isSystemThemeEnabled,
          }"
          @click="themeStore.toggleSystemTheme()"
        >
          <template v-if="themeStore.isGlassUIEnabled"> Only dark mode available in Glass UI</template>
          <template v-else>
            {{ themeStore.isSystemThemeEnabled ? "System sync enabled" : "Sync with system theme" }}
          </template>
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
  </div>
</template>
