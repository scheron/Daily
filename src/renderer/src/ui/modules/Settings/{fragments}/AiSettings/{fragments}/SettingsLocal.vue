<script setup lang="ts">
import {computed, onMounted} from "vue"
import {toasts} from "vue-toasts-lite"

import {useAiStore} from "@/stores/ai.store"
import {useLocalModelStore} from "@/stores/localModel.store"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"

import ModelCard from "./ModelCard.vue"

import type {LocalModelId} from "@shared/types/ai"

const aiStore = useAiStore()
const localStore = useLocalModelStore()

const statusLabel = computed(() => {
  const state = localStore.runtimeState
  switch (state.status) {
    case "running":
      return "Running"
    case "starting":
      return "Starting..."
    case "error":
      return "Error"
    case "downloading":
      return "Downloading..."
    case "installed":
      return "Ready"
    case "not_installed":
      return "No model installed"
    default:
      return "Unknown"
  }
})

const statusDotClass = computed(() => {
  const state = localStore.runtimeState
  switch (state.status) {
    case "running":
      return "bg-success"
    case "starting":
    case "downloading":
      return "bg-warning animate-pulse"
    case "error":
      return "bg-error"
    default:
      return "bg-base-content/30"
  }
})

const diskUsageLabel = computed(() => {
  const total = localStore.diskUsage.total
  if (total === 0) return null
  const gb = total / 1_000_000_000
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(total / 1_000_000).toFixed(0)} MB`
})

async function handleDownload(modelId: LocalModelId) {
  await localStore.downloadModel(modelId)
}

async function handleDelete(modelId: LocalModelId) {
  await localStore.deleteModel(modelId)
  toasts.success("Model deleted")
}

async function handleSelect(modelId: LocalModelId) {
  await aiStore.updateConfig({local: {model: modelId}})
}

async function handleCancelDownload(modelId: LocalModelId) {
  await localStore.cancelDownload(modelId)
}

onMounted(() => {
  localStore.loadModels()
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Runtime status -->
    <div class="bg-base-200 border-base-300 flex items-center justify-between rounded-lg border py-1 pr-2 pl-3">
      <div class="flex h-8 items-center gap-2">
        <div class="size-2 rounded-full" :class="statusDotClass" />
        <span class="text-base-content text-sm">{{ statusLabel }}</span>
        <span v-if="localStore.runtimeState.status === 'error' && 'message' in localStore.runtimeState" class="text-error text-xs">
          — {{ localStore.runtimeState.message }}
        </span>
      </div>

      <BaseButton
        v-if="localStore.isModelRunning"
        variant="secondary"
        size="sm"
        class="rounded-full p-2"
        :loading="localStore.isLoadingModels"
        @click="localStore.loadModels"
      >
        <BaseIcon name="refresh" class="size-4" :class="{'animate-spin': localStore.isLoadingModels}" />
      </BaseButton>
    </div>

    <!-- Model cards -->
    <div class="flex flex-col gap-2">
      <span class="text-base-content/80 text-xs">Models</span>
      <ModelCard
        v-for="model in localStore.models"
        :key="model.id"
        :model="model"
        :is-active="aiStore.config?.local?.model === model.id"
        :download-progress="localStore.getDownloadProgress(model.id)"
        :is-pending="localStore.isPending(model.id)"
        :error="localStore.getDownloadError(model.id)"
        @download="handleDownload(model.id)"
        @delete="handleDelete(model.id)"
        @select="handleSelect(model.id)"
        @cancel-download="handleCancelDownload(model.id)"
        @clear-error="localStore.clearDownloadError(model.id)"
      />
    </div>

    <!-- Disk usage -->
    <div v-if="diskUsageLabel" class="text-base-content/50 text-xs">Total disk usage: {{ diskUsageLabel }}</div>
  </div>
</template>
