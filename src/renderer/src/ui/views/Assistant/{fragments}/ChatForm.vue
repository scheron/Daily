<script setup lang="ts">
import {ref} from "vue"

import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import AutoSizeInput from "@/ui/common/inputs/AutoSizeInput.vue"

import type {AIConfig, AIProvider, LocalModelInfo} from "@shared/types/ai"

defineProps<{
  aiConfig: AIConfig["openai"] | AIConfig["local"] | null
  activeProvider: AIProvider
  activeModel: string
  localModels: LocalModelInfo[]
  remoteModels: string[]
  disabled?: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  send: [message: string]
  cancel: []
  selectModel: [provider: AIProvider, model: string]
}>()

const message = ref("")
const popupRef = ref<InstanceType<typeof BasePopup> | null>(null)

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault()
    sendRequest()
  }
}

function sendRequest() {
  if (!message.value.trim()) return
  emit("send", message.value)
  message.value = ""
}

function cancelRequest() {
  emit("cancel")
}

function handleSelectModel(provider: AIProvider, model: string) {
  emit("selectModel", provider, model)
  popupRef.value?.hide()
}
</script>

<template>
  <div>
    <div class="bg-base-200 border-base-300 h-fit w-full rounded-lg border">
      <AutoSizeInput v-model="message" :disabled="disabled || loading" placeholder="Ask me anything..." :max-height="200" @keydown="onKeydown" />

      <div class="flex w-full items-center justify-between gap-2 p-2">
        <BasePopup ref="popupRef" position="start" hide-header container-class="min-w-48">
          <template #trigger="{toggle}">
            <button
              class="text-base-content/80 bg-base-300 hover:bg-base-300/80 flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors"
              @click="toggle"
            >
              <BaseIcon name="ai" class="size-4" />
              {{ activeModel || "-" }}
              <BaseIcon name="chevron-down" class="size-3 opacity-60" />
            </button>
          </template>

          <template #default="{hide}">
            <div class="flex flex-col gap-1">
              <!-- Local models group -->
              <template v-if="localModels.length > 0">
                <span class="text-base-content/50 px-2 pt-1 text-[10px] font-semibold uppercase">Local</span>
                <button
                  v-for="m in localModels"
                  :key="m.id"
                  class="hover:bg-base-200 flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
                  @click="handleSelectModel('local', m.id)"
                >
                  <span
                    class="size-2 shrink-0 rounded-full border"
                    :class="activeProvider === 'local' && activeModel === m.id ? 'bg-accent border-accent' : 'border-base-content/30'"
                  />
                  <span class="text-base-content text-xs" :class="{'text-accent': activeProvider === 'local' && activeModel === m.id}">
                    {{ m.title }}
                  </span>
                </button>
              </template>

              <!-- Remote models group -->
              <template v-if="remoteModels.length > 0">
                <span class="text-base-content/50 px-2 pt-1 text-[10px] font-semibold uppercase" :class="{'mt-1': localModels.length > 0}">
                  Remote
                </span>
                <button
                  v-for="m in remoteModels"
                  :key="m"
                  class="hover:bg-base-200 flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
                  @click="handleSelectModel('openai', m)"
                >
                  <span
                    class="size-2 shrink-0 rounded-full border"
                    :class="activeProvider === 'openai' && activeModel === m ? 'bg-accent border-accent' : 'border-base-content/30'"
                  />
                  <span class="text-base-content text-xs" :class="{'text-accent': activeProvider === 'openai' && activeModel === m}">
                    {{ m }}
                  </span>
                </button>
              </template>
            </div>
          </template>
        </BasePopup>

        <BaseButton
          variant="secondary"
          size="sm"
          :icon="loading ? 'stop' : 'arrow-up'"
          class="bg-base-content/80 text-base-100 hover:bg-base-content/90 hover:text-base-100 flex aspect-square items-center justify-center rounded-full p-1"
          icon-class="size-4"
          @click="loading ? cancelRequest() : sendRequest()"
        />
      </div>
    </div>
  </div>
</template>
