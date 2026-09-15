<script setup lang="ts">
import {computed} from "vue"

import {useAiStore} from "@/stores/ai"
import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import BaseButton from "@/ui/base/BaseButton"
import BaseSegmented from "@/ui/base/BaseSegmented.vue"
import BaseSwitch from "@/ui/base/BaseSwitch.vue"
import SettingRow from "@/ui/views/Settings/{fragments}/SettingRow.vue"
import SettingsGroup from "@/ui/views/Settings/{fragments}/SettingsGroup.vue"
import {cn} from "@/utils/ui/tailwindcss"
import SettingsLocal from "./{fragments}/SettingsLocal"
import SettingsOpenAI from "./{fragments}/SettingsOpenAI"

import type {AIProvider} from "@daily/protocol"

const providerOptions: {value: AIProvider; label: string}[] = [
  {value: "local", label: "Local"},
  {value: "openai", label: "Remote"},
]

const aiStore = useAiStore()

const provider = computed(() => aiStore.config?.provider ?? "openai")

const providerDescription = computed(() => (provider.value === "local" ? "Daily AI assistant" : "DeepSeek, OpenAI, Groq, etc."))

const statusInfo = computed(() => {
  if (provider.value === "local") {
    switch (aiStore.localRuntimeState.status) {
      case "running":
        return {label: "Running", dot: "bg-success"}
      case "starting":
        return {label: "Starting…", dot: "bg-warning animate-pulse"}
      case "downloading":
        return {label: "Downloading…", dot: "bg-warning animate-pulse"}
      case "error":
        return {label: "Error", dot: "bg-error"}
      case "installed":
        return {label: "Ready", dot: "bg-base-content/40"}
      default:
        return {label: "No model", dot: "bg-base-content/30"}
    }
  }
  if (aiStore.isConnectionLoading) return {label: "Checking…", dot: "bg-warning animate-pulse"}
  if (aiStore.isConnectionLoaded) return {label: "Connected", dot: "bg-success"}
  return {label: "Not connected", dot: "bg-base-content/30"}
})

async function onChangeProvider(value: AIProvider) {
  await aiStore.updateConfig({provider: value})
  await aiStore.checkConnection()
}

function onRefresh() {
  if (provider.value === "local") aiStore.loadLocalModels()
  else aiStore.checkConnection()
}

function getStatusDotClasses(dot: string) {
  return cn("size-2 rounded-full", dot)
}
</script>

<template>
  <div class="flex flex-col gap-8 py-2">
    <SettingsGroup label="Assistant" icon="ai">
      <SettingRow title="AI Assistant" description="Your personal AI agent for your day — it acts on your tasks, not just chat">
        <div class="flex items-center gap-2.5">
          <span v-if="aiStore.config?.enabled" class="text-base-content/60 flex items-center gap-1.5 text-xs">
            <span :class="getStatusDotClasses(statusInfo.dot)" />
            {{ statusInfo.label }}
            <BaseButton variant="ghost" icon="refresh" icon-class="size-3" class="-mr-1 p-0.5" @click="onRefresh" />
          </span>
          <BaseSwitch :model-value="aiStore.config?.enabled ?? false" @update:model-value="aiStore.updateConfig({enabled: $event})" />
        </div>

        <template #below>
          <BaseAnimation name="dropIn" :duration="250">
            <div v-if="aiStore.config?.enabled" class="overflow-hidden">
              <div class="py-3">
                <SettingRow title="Provider" :description="providerDescription">
                  <BaseSegmented :model-value="provider" :options="providerOptions" @update:model-value="onChangeProvider" />
                </SettingRow>
              </div>

              <div class="py-3">
                <SettingsOpenAI v-if="provider === 'openai'" />
                <SettingsLocal v-else />
              </div>

              <div class="py-3">
                <SettingRow
                  title="Open web links without asking"
                  description="The assistant can always read a specific URL you provide. By default it asks for confirmation before each fetch."
                >
                  <BaseSwitch
                    :model-value="aiStore.config?.webAccess?.autoApprove ?? false"
                    @update:model-value="aiStore.updateConfig({webAccess: {autoApprove: $event}})"
                  />
                </SettingRow>
              </div>
            </div>
          </BaseAnimation>
        </template>
      </SettingRow>
    </SettingsGroup>
  </div>
</template>
