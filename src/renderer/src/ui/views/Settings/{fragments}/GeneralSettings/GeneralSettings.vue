<script setup lang="ts">
import {useThemeStore} from "@/stores/theme.store"
import {useUIStore} from "@/stores/ui"
import BaseSegmented from "@/ui/base/BaseSegmented.vue"
import AccentPicker from "@/ui/common/pickers/AccentPicker.vue"

import AboutSection from "./{fragments}/AboutSection.vue"
import WidgetsSection from "./{fragments}/WidgetsSection.vue"
import SettingRow from "../SettingRow.vue"
import SettingsGroup from "../SettingsGroup.vue"

import type {EmptySectionsMode} from "@/stores/ui/composables/useSectionPrefs"
import type {AppearanceMode} from "@shared/types/storage"

const uiStore = useUIStore()
const themeStore = useThemeStore()

const themeOptions: {value: AppearanceMode; label: string}[] = [
  {value: "light", label: "Light"},
  {value: "dark", label: "Dark"},
  {value: "system", label: "System"},
]

const emptySectionsOptions: {value: EmptySectionsMode; label: string}[] = [
  {value: "show", label: "Show"},
  {value: "collapse", label: "Collapse"},
  {value: "hide", label: "Hide"},
]
</script>

<template>
  <div class="flex flex-col gap-8 py-2">
    <SettingsGroup label="Theme" icon="appearance">
      <SettingRow title="Theme" description="Light, dark, or follow the system">
        <BaseSegmented :model-value="themeStore.mode" :options="themeOptions" @update:model-value="themeStore.setMode" />
      </SettingRow>

      <SettingRow title="Main Color" description="Pick the accent used across the app">
        <AccentPicker />
      </SettingRow>
    </SettingsGroup>

    <SettingsGroup label="Content" icon="layout">
      <SettingRow title="Empty columns" description="How columns appear when a day has no tasks">
        <BaseSegmented v-model="uiStore.emptySectionsMode" :options="emptySectionsOptions" />
      </SettingRow>
    </SettingsGroup>

    <SettingRow title="Left panel widgets" description="Add, remove, and drag to reorder the widgets shown in the left panel">
      <WidgetsSection class="w-80" />
    </SettingRow>

    <SettingsGroup label="About" icon="info">
      <AboutSection />
    </SettingsGroup>
  </div>
</template>
