<script setup lang="ts">
import {useSettingValue} from "@/composables/useSettingValue"
import {useThemeStore} from "@/stores/theme"
import BaseSegmented from "@/ui/base/BaseSegmented.vue"
import BaseSwitch from "@/ui/base/BaseSwitch.vue"
import SettingRow from "@/ui/views/Settings/{fragments}/SettingRow.vue"
import SettingsGroup from "@/ui/views/Settings/{fragments}/SettingsGroup.vue"
import AboutSection from "./{fragments}/AboutSection.vue"
import AccentPicker from "./{fragments}/AccentPicker.vue"
import MainColorPicker from "./{fragments}/MainColorPicker.vue"
import QuickTaskHotkey from "./{fragments}/QuickTaskHotkey.vue"
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

const themeStore = useThemeStore()
const shouldNotify = useSettingValue("focus.shouldNotify", true)
const shouldPlaySound = useSettingValue("focus.shouldPlaySound", true)
const isMenuBarVisible = useSettingValue("menuBar.isVisible", true)
</script>

<template>
  <div class="flex flex-col gap-8 py-2">
    <SettingsGroup label="Appearance" icon="appearance">
      <SettingRow title="Theme" description="Light, dark, or follow the system">
        <BaseSegmented :model-value="themeStore.mode" :options="themeOptions" @update:model-value="themeStore.setMode" />
      </SettingRow>

      <SettingRow title="Shell Color" description="Tint of the app background across light and dark themes">
        <MainColorPicker />
      </SettingRow>

      <SettingRow title="Main Color" description="Pick the accent used across the app">
        <AccentPicker />
      </SettingRow>

      <SettingRow title="Text size" description="Choose the text size used throughout Daily">
        <BaseSegmented v-model="themeStore.fontSize" :options="fontSizeOptions" />
      </SettingRow>

      <SettingRow title="Show icon in menu bar" description="Keep the Daily icon in the menu bar to open Settings or Quick task">
        <BaseSwitch v-model="isMenuBarVisible" />
      </SettingRow>
    </SettingsGroup>

    <SettingsGroup label="Focus" icon="stopwatch">
      <SettingRow title="Notifications" description="Notify when a focus interval or a break ends while Daily is in the background">
        <BaseSwitch v-model="shouldNotify" />
      </SettingRow>

      <SettingRow title="Sound" description="Play a sound with the notification">
        <BaseSwitch v-model="shouldPlaySound" :disabled="!shouldNotify" />
      </SettingRow>
    </SettingsGroup>

    <SettingsGroup label="Shortcuts" icon="keyboard">
      <QuickTaskHotkey />

      <ShortcutsSection />
    </SettingsGroup>

    <SettingsGroup label="About" icon="info">
      <AboutSection />
    </SettingsGroup>
  </div>
</template>
