<script setup lang="ts">
import {computed, onBeforeMount, reactive, ref} from "vue"

import {REMOTE_API_PROVIDERS} from "@shared/constants/ai"
import {AIConfig} from "@shared/types/ai"
import {useAiStore} from "@/stores/ai"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseInput from "@/ui/base/BaseInput.vue"
import BaseSegmented from "@/ui/base/BaseSegmented.vue"
import ModelPicker from "@/ui/common/pickers/ModelPicker.vue"

import SettingRow from "../../SettingRow.vue"

const aiStore = useAiStore()

const aiConfig = reactive<NonNullable<AIConfig["openai"]>>({
  baseUrl: "",
  apiKey: "",
  model: "",
})

const isApiKeyVisible = ref(false)

const storedKey = computed(() => aiStore.config?.openai?.apiKey ?? "")
const storedBaseUrl = computed(() => aiStore.config?.openai?.baseUrl ?? "")

const isKeyChanged = computed(() => aiConfig.apiKey !== storedKey.value)
const isProviderChanged = computed(() => aiConfig.baseUrl !== storedBaseUrl.value)
const isConfigChanged = computed(() => isKeyChanged.value || isProviderChanged.value)

async function onConnect() {
  await aiStore.updateConfig({openai: aiConfig})
  await aiStore.checkConnection()

  if (!aiConfig.model && aiStore.availableModels.length) {
    aiConfig.model = aiStore.availableModels[0]
    await aiStore.updateConfig({openai: aiConfig})
  }
}

function onSelectModel(model: string) {
  aiConfig.model = model
  aiStore.updateConfig({openai: aiConfig})
}

onBeforeMount(() => {
  aiConfig.baseUrl = aiStore.config?.openai?.baseUrl ?? REMOTE_API_PROVIDERS[0].value
  aiConfig.apiKey = aiStore.config?.openai?.apiKey ?? ""
  aiConfig.model = aiStore.config?.openai?.model ?? ""
})
</script>

<template>
  <div class="flex flex-col gap-1">
    <SettingRow title="API Provider" description="OpenAI-compatible endpoint">
      <BaseSegmented v-model="aiConfig.baseUrl" :options="REMOTE_API_PROVIDERS" />
    </SettingRow>

    <SettingRow title="API Key" description="Stored on this device; included in iCloud sync when sync is on.">
      <div class="flex items-center gap-1">
        <BaseButton variant="ghost" size="sm" class="shrink-0 p-1" @click="isApiKeyVisible = !isApiKeyVisible">
          <BaseIcon :name="isApiKeyVisible ? 'eye-off' : 'eye'" class="size-4" />
        </BaseButton>
        <div class="w-52 flex-1">
          <BaseInput v-model="aiConfig.apiKey" :type="isApiKeyVisible ? 'text' : 'password'" placeholder="sk-..." class="flex-1 text-xs" />
        </div>
      </div>
    </SettingRow>

    <SettingRow v-if="aiStore.availableModels.length" title="Model" description="The language model that serves as the assistant's brain">
      <ModelPicker :model-value="aiConfig.model" :options="aiStore.availableModels" trigger-class="w-52" @update:model-value="onSelectModel" />
    </SettingRow>

    <BaseButton
      v-if="!aiStore.isConnected || isConfigChanged"
      :loading="aiStore.isConnectionLoading"
      variant="primary"
      size="sm"
      class="mt-3 w-full py-1"
      @click="onConnect"
    >
      Connect
    </BaseButton>
  </div>
</template>
