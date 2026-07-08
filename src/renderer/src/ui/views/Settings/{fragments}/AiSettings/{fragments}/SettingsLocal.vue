<script setup lang="ts">
import {computed, onMounted} from "vue"
import {toasts} from "vue-toasts-lite"
import {sort} from "fast-sort"

import {UNLOAD_MODEL_TIME} from "@shared/constants/ai"
import {useAiStore} from "@/stores/ai"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseSegmented from "@/ui/base/BaseSegmented.vue"

import SettingRow from "../../SettingRow.vue"
import LocalModelCard from "./LocalModelCard.vue"

import type {UnloadModelTime} from "@shared/types/ai"
import type {LabeledOption} from "../../../model/types"

const aiStore = useAiStore()

const sortedModels = computed(() => sort(aiStore.localModels).asc((model) => model.sizeBytes))

const unloadOptions: LabeledOption<UnloadModelTime>[] = (Object.keys(UNLOAD_MODEL_TIME) as UnloadModelTime[]).map((value) => ({
  value,
  label: value === "never" ? "Never" : value,
}))

const diskUsageLabel = computed(() => {
  const total = aiStore.localDiskUsage.total
  if (!total) return null

  const gb = total / 1_000_000_000
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(total / 1_000_000).toFixed(0)} MB`
})

const unloadModel = computed<UnloadModelTime>({
  get: () => aiStore.config?.local?.unloadModel ?? "15m",
  set: (value) => {
    aiStore.updateConfig({
      local: {
        ...(aiStore.config?.local ?? {model: ""}),
        unloadModel: value,
      },
    })
  },
})

async function onRefreshCatalog() {
  const result = await aiStore.refreshLocalCatalog()
  if (result === "updated") toasts.success("Model list updated")
  else if (result === "unchanged") toasts.info("Model list is up to date")
  else toasts.error("Couldn't update the model list")
}

onMounted(() => {
  aiStore.loadLocalModels()
})
</script>

<template>
  <div class="flex flex-col">
    <SettingRow title="Models">
      <BaseButton
        variant="ghost"
        size="sm"
        class="h-7 px-2 py-0"
        tooltip="Refresh model list from GitHub"
        :disabled="aiStore.isRefreshingLocalCatalog"
        @click="onRefreshCatalog"
      >
        <BaseIcon name="refresh" class="size-4" :class="{'animate-spin': aiStore.isRefreshingLocalCatalog}" />
      </BaseButton>

      <template #below>
        <div class="grid grid-cols-2 gap-2 pt-1">
          <LocalModelCard
            v-for="model in sortedModels"
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
      </template>
    </SettingRow>

    <SettingRow title="Unload model after idle" description="Free memory by stopping the model after it sits idle.">
      <BaseSegmented v-model="unloadModel" :options="unloadOptions" />

      <template v-if="diskUsageLabel" #below>
        <p class="text-base-content/50 text-xs">Total disk usage: {{ diskUsageLabel }}</p>
      </template>
    </SettingRow>
  </div>
</template>
