<script setup lang="ts">
import {useThemeStore} from "@/stores/theme"
import {useUIStore} from "@/stores/ui"
import BaseSegmented from "@/ui/base/BaseSegmented.vue"
import BaseSwitch from "@/ui/base/BaseSwitch.vue"
import SettingRow from "@/ui/views/Settings/{fragments}/SettingRow.vue"
import SettingsGroup from "@/ui/views/Settings/{fragments}/SettingsGroup.vue"
import AboutSection from "./{fragments}/AboutSection.vue"
import AccentPicker from "./{fragments}/AccentPicker.vue"
import MainColorPicker from "./{fragments}/MainColorPicker.vue"
import ShortcutsSection from "./{fragments}/ShortcutsSection.vue"

import type {AppearanceMode, FontSize} from "@daily/protocol"

const themeOptions: {value: AppearanceMode; label: string}[] = [
  {value: "light", label: "Light"},
  {value: "dark", label: "Dark"},
  {value: "system", label: "System"},
]

const fontSizeOptions: {value: FontSize; label: string}[] = [
  {value: "small", label: "Small"},
  {value: "normal", label: "Normal"},
  {value: "large", label: "Large"},
]

const uiStore = useUIStore()
const themeStore = useThemeStore()
</script>

<template>
  <div class="flex flex-col gap-8 py-2">
    <SettingsGroup label="Theme" icon="appearance">
      <SettingRow title="Theme" description="Light, dark, or follow the system">
        <BaseSegmented :model-value="themeStore.mode" :options="themeOptions" @update:model-value="themeStore.setMode" />
      </SettingRow>

      <SettingRow title="Main Color" description="Tint of the app background across light and dark themes">
        <MainColorPicker />
      </SettingRow>

      <SettingRow title="Accent Color" description="Pick the accent used across the app">
        <AccentPicker />
      </SettingRow>
    </SettingsGroup>

    <SettingsGroup label="Content" icon="layout">
      <SettingRow title="Text size" description="Choose the text size used throughout Daily">
        <BaseSegmented v-model="themeStore.fontSize" :options="fontSizeOptions" />
      </SettingRow>

      <SettingRow
        title="Open calendar while dragging"
        description="Expand the calendar as soon as a card is picked up. When off, hold the card on the calendar button to open it"
      >
        <BaseSwitch v-model="uiStore.shouldOpenCalendarDockOnDrag" />
      </SettingRow>
    </SettingsGroup>

    <SettingsGroup label="Shortcuts" icon="keyboard">
      <ShortcutsSection />
    </SettingsGroup>

    <SettingsGroup label="About" icon="info">
      <AboutSection />
    </SettingsGroup>
  </div>
</template>
