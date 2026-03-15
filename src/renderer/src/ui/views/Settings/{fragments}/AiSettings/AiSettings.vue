<script setup lang="ts">
import {AIProvider} from "@shared/types/ai"
import {useAiStore} from "@/stores/ai/ai.store"
import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import BaseCard from "@/ui/base/BaseCard.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseSwitch from "@/ui/base/BaseSwitch.vue"
import SelectableButton from "@/ui/common/buttons/SelectableButton.vue"

import SettingsLocal from "./{fragments}/SettingsLocal.vue"
import SettingsOpenAI from "./{fragments}/SettingsOpenAI.vue"

const aiStore = useAiStore()

const providers: Array<{id: AIProvider; name: string; description: string; recommended?: boolean}> = [
  {id: "local", name: "Local", description: "Daily AI assistant"},
  {id: "openai", name: "Remote", description: "DeepSeek, OpenAI, Groq, etc.", recommended: true},
]

async function onChangeProvider(provider: AIProvider) {
  await aiStore.updateConfig({provider})
  await aiStore.checkConnection()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <BaseCard title="Enable AI Assistant" description="Chat with AI to manage daily workflow">
      <BaseSwitch :model-value="aiStore.config?.enabled ?? false" @update:model-value="aiStore.updateConfig({enabled: $event})" />
    </BaseCard>

    <BaseAnimation name="dropIn" :duration="250">
      <div v-if="aiStore.config?.enabled" class="overflow-hidden rounded-lg">
        <div class="py-3">
          <span class="text-base-content mb-2 flex items-center gap-1.5 text-xs font-semibold">
            <BaseIcon name="ai" class="-mt-0.5 size-4" />
            Provider
          </span>
          <div class="flex gap-2">
            <SelectableButton v-for="p in providers" :key="p.id" :active="aiStore.config?.provider === p.id" @click="onChangeProvider(p.id)">
              <p class="text-base-content text-sm font-medium">
                {{ p.name }}
                <BaseIcon v-if="p.recommended" v-tooltip="'Recommended'" name="award" class="text-accent -mt-1 size-4" />
              </p>
              <p class="text-base-content/60 text-xs">{{ p.description }}</p>
            </SelectableButton>
          </div>
        </div>

        <div class="border-base-300 border-t py-3">
          <SettingsOpenAI v-if="aiStore.config?.provider === 'openai'" />
          <SettingsLocal v-else-if="aiStore.config?.provider === 'local'" />
        </div>
      </div>
    </BaseAnimation>
  </div>
</template>
