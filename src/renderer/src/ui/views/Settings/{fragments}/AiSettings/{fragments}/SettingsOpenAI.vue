<script setup lang="ts">
import {onBeforeMount, reactive, ref} from "vue"

import {AIConfig} from "@shared/types/ai"
import {useAiStore} from "@/stores/ai/ai.store"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseInput from "@/ui/base/BaseInput.vue"
import SelectableButton from "@/ui/common/buttons/SelectableButton.vue"

const MODEL_API_LIST = [
  {label: "OpenAI", value: "https://api.openai.com/v1"},
  {label: "DeepSeek", value: "https://api.deepseek.com/v1"},
]

const aiStore = useAiStore()

const aiConfig = reactive<NonNullable<AIConfig["openai"]>>({
  baseUrl: "",
  apiKey: "",
  model: "",
})

const showApiKey = ref(false)

async function onConnect() {
  await aiStore.updateConfig({openai: aiConfig})
  await aiStore.checkConnection()

  if (aiStore.availableModels.length) {
    aiConfig.model = aiStore.availableModels[0]
    await aiStore.updateConfig({openai: aiConfig})
  }
}

function setBaseUrl(event: Event) {
  const select = event.target as HTMLSelectElement
  aiConfig.baseUrl = select.value
}

onBeforeMount(() => {
  aiConfig.baseUrl = aiStore.config?.openai?.baseUrl ?? MODEL_API_LIST[0].value
  aiConfig.apiKey = aiStore.config?.openai?.apiKey ?? ""
  aiConfig.model = aiStore.config?.openai?.model ?? ""
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="bg-base-200 border-base-300 flex items-center justify-between rounded-lg border py-1 pr-2 pl-3">
      <div class="flex h-8 items-center gap-2">
        <template v-if="aiStore.isConnectionLoading">
          <div class="bg-warning size-2 rounded-full" />
          <span class="text-base-content text-sm">
            {{ aiStore.isConnectionLoading ? `Checking connection...` : "" }}
          </span>
        </template>
        <template v-else>
          <div class="size-2 rounded-full" :class="aiStore.isConnectionLoaded ? 'bg-success' : 'bg-error'" />
          <span class="text-base-content text-sm">
            {{ aiStore.isConnectionLoaded ? "Connected" : "Not connected" }}
          </span>
        </template>
      </div>

      <BaseButton
        v-if="aiStore.isConnected"
        variant="secondary"
        size="sm"
        class="rounded-full p-2"
        :loading="aiStore.isConnectionLoading"
        @click="aiStore.checkConnection"
      >
        <BaseIcon name="refresh" class="size-4" :class="{'animate-spin': aiStore.isConnectionLoading}" />
      </BaseButton>
    </div>

    <div class="space-y-1">
      <span class="text-base-content/80 text-xs">API Provider</span>
      <div class="mt-1 flex gap-2">
        <select
          class="text-base-content bg-base-100 border-base-300 hover:border-accent focus:border-accent w-full rounded-md border px-2 py-1.5 text-sm transition-colors outline-none select-none"
          :value="aiConfig.baseUrl"
          @change="setBaseUrl"
        >
          <option v-for="model in MODEL_API_LIST" :key="model.value" :value="model.value">
            {{ model.label }}
          </option>
        </select>
      </div>
    </div>

    <div class="space-y-1">
      <span class="text-base-content/80 text-xs">API Key</span>
      <div class="mt-1 flex gap-2">
        <BaseInput v-model="aiConfig.apiKey" :type="showApiKey ? 'text' : 'password'" placeholder="sk-..." class="flex-1" />
        <BaseButton variant="ghost" size="sm" class="p-1" @click="showApiKey = !showApiKey">
          <BaseIcon :name="showApiKey ? 'eye-off' : 'eye'" class="size-4" />
        </BaseButton>
      </div>
    </div>

    <div v-if="aiStore.availableModels.length" class="space-y-1">
      <span class="text-base-content/80 text-xs">Model</span>
      <div class="mt-2 flex flex-wrap gap-1">
        <SelectableButton
          v-for="availableModel in aiStore.availableModels"
          :key="availableModel"
          :active="availableModel === aiConfig.model"
          class="flex w-fit items-center justify-center px-2 py-1.5 text-xs text-nowrap"
          size="sm"
          @click="aiConfig.model = availableModel"
        >
          {{ availableModel }}
        </SelectableButton>
      </div>
    </div>

    <BaseButton
      v-if="!aiStore.isConnected"
      :loading="aiStore.isConnectionLoading"
      variant="primary"
      size="sm"
      class="mt-2 w-full py-1"
      @click="onConnect"
    >
      Connect
    </BaseButton>
  </div>
</template>
