<script setup lang="ts">
import {computed, onMounted, ref} from "vue"
import {toasts} from "vue-toasts-lite"

import {useThemeStore} from "@/stores/theme.store"
import {useUIStore} from "@/stores/ui"
import BaseButton from "@/ui/base/BaseButton"
import BaseSegmented from "@/ui/base/BaseSegmented.vue"
import AccentPicker from "@/ui/common/pickers/AccentPicker.vue"
import MainColorPicker from "@/ui/common/pickers/MainColorPicker.vue"

import AboutSection from "./{fragments}/AboutSection.vue"
import WidgetsSection from "./{fragments}/WidgetsSection.vue"
import SettingRow from "../SettingRow.vue"
import SettingsGroup from "../SettingsGroup.vue"

import type {EmptySectionsMode} from "@/stores/ui/composables/useSectionPrefs"
import type {CliInstallState} from "@shared/types/shell"
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

const cliState = ref<CliInstallState | null>(null)
const isInstallingCli = ref(false)
const isConfiguringCliPath = ref(false)

const cliDescription = computed(() => {
  const state = cliState.value
  if (!state) return "Install the daily command for terminal automation"
  if (!state.available) return "CLI is available in packaged builds"
  if (state.conflict) return `${state.binPath} already exists and is not managed by Daily`
  if (state.installed) {
    if (state.pathIncludesBin) return "Run daily tasks from any terminal"
    if (state.shellProfileIncludesBin) return "Open a new terminal window to use daily"
    return `Add ${state.binDir} to your zsh PATH`
  }
  return `Install daily to ${state.binPath}`
})

const cliButtonLabel = computed(() => {
  if (!cliState.value?.available) return "Unavailable"
  if (cliState.value.installed) return cliState.value.pathIncludesBin ? "Installed" : "Add to PATH"
  return "Install"
})

async function installCli() {
  const state = cliState.value
  if (state?.installed && !state.pathIncludesBin) return configureCliPath()

  isInstallingCli.value = true
  try {
    const result = await window.BridgeIPC["shell:install-cli"]()
    cliState.value = result.state
    if (result.ok) toasts.success("CLI installed")
    else toasts.error(result.error ?? "Failed to install CLI")
  } finally {
    isInstallingCli.value = false
  }
}

async function configureCliPath() {
  isConfiguringCliPath.value = true
  try {
    const result = await window.BridgeIPC["shell:configure-cli-path"]()
    cliState.value = result.state
    if (result.ok) toasts.success("PATH updated. Open a new terminal window.")
    else toasts.error(result.error ?? "Failed to update PATH")
  } finally {
    isConfiguringCliPath.value = false
  }
}

onMounted(async () => {
  cliState.value = await window.BridgeIPC["shell:get-cli-install-state"]()
})
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
      <SettingRow title="Empty columns" description="How columns appear when a day has no tasks">
        <BaseSegmented v-model="uiStore.emptySectionsMode" :options="emptySectionsOptions" />
      </SettingRow>
    </SettingsGroup>

    <SettingsGroup label="Command Line" icon="code">
      <SettingRow title="Daily CLI" :description="cliDescription">
        <BaseButton
          variant="secondary"
          size="sm"
          :disabled="!cliState?.available || (cliState.installed && cliState.pathIncludesBin) || cliState.conflict"
          :loading="isInstallingCli || isConfiguringCliPath"
          @click="installCli"
        >
          {{ cliButtonLabel }}
        </BaseButton>
        <template #below>
          <p
            v-if="cliState?.installed && !cliState.pathIncludesBin && !cliState.shellProfileIncludesBin"
            class="text-base-content/60 font-mono text-xs"
          >
            {{ cliState.pathHint }}
          </p>
          <p v-else-if="cliState?.installed && cliState.shellProfileIncludesBin && !cliState.pathIncludesBin" class="text-base-content/60 text-xs">
            Restart your terminal or run <span class="font-mono">source {{ cliState.shellProfilePath }}</span
            >.
          </p>
        </template>
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
