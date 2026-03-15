<script setup lang="ts">
import {computed, onMounted} from "vue"

import {useAiStore} from "@/stores/ai/ai.store"
import BaseButton from "@/ui/base/BaseButton.vue"

import LocalModelCard from "./LocalModelCard.vue"

const aiStore = useAiStore()

const statusLabel = computed(() => {
  const state = aiStore.localRuntimeState
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
  const state = aiStore.localRuntimeState
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
  const total = aiStore.localDiskUsage.total
  if (!total) return null

  const gb = total / 1_000_000_000
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(total / 1_000_000).toFixed(0)} MB`
})

onMounted(() => {
  aiStore.loadLocalModels()
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="size-2 rounded-full" :class="statusDotClass" />
        <span class="text-sm" :class="aiStore.localRuntimeState.status === 'running' ? 'text-success' : 'text-base-content/70'">
          {{ statusLabel }}
        </span>
        <span v-if="aiStore.localRuntimeState.status === 'error' && 'message' in aiStore.localRuntimeState" class="text-error text-xs">
          — {{ aiStore.localRuntimeState.message }}
        </span>
      </div>

      <BaseButton
        v-if="aiStore.isLocalModelRunning"
        variant="ghost"
        size="sm"
        class="text-accent hover:bg-accent/10 -mr-1"
        icon-class="size-3.5"
        icon="refresh"
        :loading="aiStore.isLocalModelsLoading"
        @click="aiStore.loadLocalModels"
      />
    </div>

    <div class="flex flex-col gap-2">
      <span class="text-base-content/80 text-xs">Models</span>
      <LocalModelCard
        v-for="model in aiStore.localModels"
        :key="model.id"
        :model="model"
        :is-active="aiStore.config?.local?.model === model.id && model.installed"
        :download-progress="aiStore.getLocalDownloadProgress(model.id)"
        :is-pending="aiStore.isLocalModelPending(model.id)"
        :error="aiStore.getLocalDownloadError(model.id)"
        @download="aiStore.downloadLocalModel(model.id)"
        @delete="aiStore.deleteLocalModel(model.id)"
        @select="aiStore.selectLocalModel(model.id)"
        @cancel-download="aiStore.cancelLocalModelDownload(model.id)"
        @clear-error="aiStore.clearLocalDownloadError(model.id)"
      />
    </div>

    <div v-if="diskUsageLabel" class="text-base-content/50 text-xs">Total disk usage: {{ diskUsageLabel }}</div>
  </div>
</template>
