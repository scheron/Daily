<script setup lang="ts">
import {ref} from "vue"

import {useAiStore} from "@/stores/ai.store"
import {useSettingValue} from "@/composables/useSettingsValue"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseInput from "@/ui/base/BaseInput.vue"
import SelectableButton from "@/ui/common/buttons/SelectableButton.vue"

const aiStore = useAiStore()

// @ts-ignore TODO: fix type . Logic is working but types are not correct
const openaiApiKey = useSettingValue("ai.openai.apiKey", "")
// @ts-ignore TODO: fix type . Logic is working but types are not correct
const openaiBaseUrl = useSettingValue("ai.openai.baseUrl", "")
// @ts-ignore TODO: fix type . Logic is working but types are not correct
const openaiModel = useSettingValue("ai.openai.model", "")

const showApiKey = ref(false)
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="bg-base-200 border-base-300 flex items-center justify-between rounded-lg border py-1 pr-2 pl-3">
      <div class="flex items-center gap-2">
        <template v-if="aiStore.isLoading">
          <div class="bg-warning size-2 rounded-full" />
          <span class="text-base-content text-sm">
            {{ aiStore.isLoading ? `Checking connection...` : "" }}
          </span>
        </template>
        <template v-else>
          <div class="size-2 rounded-full" :class="aiStore.isConnected ? 'bg-success' : 'bg-error'" />
          <span class="text-base-content text-sm">
            {{ aiStore.isConnected ? "Connected" : "Not connected" }}
          </span>
        </template>
      </div>

      <BaseButton variant="secondary" size="sm" class="rounded-full p-2" :loading="aiStore.isLoading" @click="aiStore.checkConnection">
        <BaseIcon name="refresh" class="size-4" :class="{'animate-spin': aiStore.isLoading}" />
      </BaseButton>
    </div>

    <div class="space-y-1">
      <span class="text-base-content/80 text-xs">API URL</span>
      <div class="mt-1 flex gap-2">
        <BaseInput v-model="openaiBaseUrl" placeholder="https://api.openai.com/v1" class="w-full" />
      </div>
    </div>

    <div class="space-y-1">
      <span class="text-base-content/80 text-xs">API Key</span>
      <div class="mt-1 flex gap-2">
        <BaseInput v-model="openaiApiKey" :type="showApiKey ? 'text' : 'password'" placeholder="sk-..." class="flex-1" />
        <BaseButton variant="ghost" size="sm" class="p-1" @click="showApiKey = !showApiKey">
          <BaseIcon :name="showApiKey ? 'eye-off' : 'eye'" class="size-4" />
        </BaseButton>
      </div>
    </div>

    <div class="space-y-1">
      <span class="text-base-content/80 text-xs">Model</span>
      <div v-if="aiStore.availableModels.length" class="mt-2 flex flex-wrap gap-1">
        <SelectableButton
          v-for="model in aiStore.availableModels"
          :key="model"
          :active="openaiModel === model"
          class="flex w-fit items-center justify-center px-2 py-1.5 text-xs text-nowrap"
          size="sm"
          @click="openaiModel = model"
        >
          {{ model }}
        </SelectableButton>
      </div>
    </div>
  </div>
</template>
