<script setup lang="ts">
import {useAiStore} from "@/stores/ai.store"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseSwitch from "@/ui/base/BaseSwitch.vue"
import SelectableButton from "@/ui/common/buttons/SelectableButton.vue"

import SettingsOpenAI from "./{fragments}/SettingsOpenAI.vue"

const aiStore = useAiStore()

const providers: Array<{id: any; name: string; description: string; recommended?: boolean}> = [
  {id: "ollama", name: "Local", description: "Daily AI assistant"},
  {id: "openai", name: "Remote", description: "DeepSeek, OpenAI, Groq, etc.", recommended: true},
]
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-start justify-between">
      <div>
        <p class="text-base-content text-sm">Enable AI Assistant</p>
        <p class="text-base-content/60 text-xs">Chat with AI to manage daily workflow</p>
      </div>
      <BaseSwitch :model-value="aiStore.config?.enabled ?? false" @update:model-value="aiStore.updateConfig({enabled: $event})" />
    </div>

    <template v-if="aiStore.config?.enabled">
      <div class="flex flex-col gap-2">
        <span class="text-base-content/80 text-xs">Provider</span>
        <div class="flex gap-2">
          <SelectableButton
            v-for="p in providers"
            :key="p.id"
            :active="aiStore.config?.provider === p.id"
            @click="aiStore.updateConfig({provider: p.id})"
          >
            <p class="text-base-content text-sm font-medium">
              {{ p.name }}
              <BaseIcon v-if="p.recommended" v-tooltip="'Recommended'" name="award" class="text-accent -mt-1 size-4" />
            </p>
            <p class="text-base-content/60 text-xs">{{ p.description }}</p>
          </SelectableButton>
        </div>
      </div>

      <SettingsOpenAI v-if="aiStore.config?.provider === 'openai'" />

      <template v-else>
        <div class="text-base-content/60 text-xs">Local model will be available soon. You can use remote models for now.</div>
      </template>
    </template>
  </div>
</template>
