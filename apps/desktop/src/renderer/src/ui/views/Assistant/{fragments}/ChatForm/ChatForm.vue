<script setup lang="ts">
import {ref, useTemplateRef} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import {cn} from "@/utils/ui/tailwindcss"
import AutoSizeInput from "./{fragments}/AutoSizeInput.vue"
import ContextRing from "./{fragments}/ContextRing"

import type {AIProvider} from "@daily/protocol"
import type {LocalModelInfo} from "@shared/types/ai"

defineProps<{
  activeProvider: AIProvider
  activeModel: string
  localModels: LocalModelInfo[]
  remoteModels: string[]
  loading?: boolean
}>()

const emit = defineEmits<{
  send: [message: string]
  cancel: []
  selectModel: [provider: AIProvider, model: string]
}>()

const message = ref("")
const popupRef = useTemplateRef<InstanceType<typeof BasePopup>>("popup")

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

function getModelDotClasses(isActive: boolean) {
  return cn("size-2 shrink-0 rounded-full border", isActive ? "bg-accent border-accent" : "border-base-content/30")
}

function getModelLabelClasses(isActive: boolean) {
  return cn("text-xs", isActive ? "text-accent" : "text-base-content")
}

function getRemoteGroupLabelClasses(hasLocalModels: boolean) {
  return cn("text-base-content/50 px-2 pt-1 text-[10px] font-semibold uppercase", hasLocalModels && "mt-1")
}
</script>

<template>
  <div>
    <div class="bg-base-200 border-base-300 h-fit w-full rounded-lg border">
      <AutoSizeInput v-model="message" :disabled="loading" placeholder="Ask me anything..." @keydown="onKeydown" />

      <div class="flex w-full items-center justify-between gap-2 p-2">
        <BasePopup ref="popup" position="start" hide-header container-class="min-w-48">
          <template #trigger="{toggle}">
            <BaseButton variant="tertiary" icon="ai" size="xs" @click="toggle">
              {{ activeModel || "-" }}
              <BaseIcon name="chevron-down" class="size-3 opacity-60" />
            </BaseButton>
          </template>

          <template #default="{hide}">
            <div class="flex flex-col gap-1">
              <template v-if="localModels.length > 0">
                <span class="text-base-content/50 px-2 pt-1 text-[10px] font-semibold uppercase">Local</span>
                <BaseButton v-for="m in localModels" :key="m.id" variant="cell" size="sm" @click="handleSelectModel('local', m.id)">
                  <span :class="getModelDotClasses(activeProvider === 'local' && activeModel === m.id)" />
                  <span :class="getModelLabelClasses(activeProvider === 'local' && activeModel === m.id)">{{ m.title }}</span>
                </BaseButton>
              </template>

              <template v-if="remoteModels.length > 0">
                <span :class="getRemoteGroupLabelClasses(localModels.length > 0)">Remote</span>
                <BaseButton v-for="m in remoteModels" :key="m" variant="cell" size="sm" @click="handleSelectModel('openai', m)">
                  <span :class="getModelDotClasses(activeProvider === 'openai' && activeModel === m)" />
                  <span :class="getModelLabelClasses(activeProvider === 'openai' && activeModel === m)">{{ m }}</span>
                </BaseButton>
              </template>
            </div>
          </template>
        </BasePopup>

        <div class="flex items-center gap-2">
          <ContextRing />
          <BaseButton variant="inverted" :icon="loading ? 'stop' : 'arrow-up'" size="sm" @click="loading ? cancelRequest() : sendRequest()" />
        </div>
      </div>
    </div>
  </div>
</template>
