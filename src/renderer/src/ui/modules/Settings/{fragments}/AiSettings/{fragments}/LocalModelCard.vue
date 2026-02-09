<script setup lang="ts">
import {computed} from "vue"

import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"

import type {LocalModelDownloadProgress, LocalModelInfo} from "@shared/types/ai"

const props = defineProps<{
  model: LocalModelInfo
  isActive: boolean
  downloadProgress: LocalModelDownloadProgress | null
  isPending?: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  download: []
  delete: []
  select: []
  cancelDownload: []
  clearError: []
}>()

const isDownloading = computed(() => props.downloadProgress !== null)

const sizeLabel = computed(() => {
  const gb = props.model.sizeBytes / 1_000_000_000
  return gb >= 1 ? `~${gb.toFixed(1)} GB` : `~${(props.model.sizeBytes / 1_000_000).toFixed(0)} MB`
})

function onDownload() {
  emit("clearError")
  emit("download")
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="bg-base-200 border-base-300 flex flex-col gap-2 rounded-lg border p-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-base-content text-sm font-medium">{{ model.title }}</span>
          <BaseIcon v-if="model.recommended" v-tooltip="'Recommended'" name="award" class="text-accent size-4" />
          <span v-if="isActive" class="text-accent text-xs font-medium">Active</span>
        </div>

        <div class="flex items-center gap-1">
          <template v-if="isPending && !isDownloading">
            <BaseIcon name="refresh" class="text-base-content/50 size-4 animate-spin" />
          </template>

          <template v-else-if="!model.installed && !isDownloading">
            <BaseButton variant="secondary" size="sm" class="px-2 py-1 text-xs" @click="onDownload"> Download </BaseButton>
          </template>

          <template v-else-if="isDownloading">
            <BaseButton variant="ghost" size="sm" class="text-warning hover:text-warning p-0 text-xs" @click="emit('cancelDownload')">
              Cancel
            </BaseButton>
          </template>

          <template v-else-if="model.installed && !isActive">
            <BaseButton variant="secondary" size="sm" class="px-2 py-1 text-xs" @click="emit('select')"> Select </BaseButton>
            <BaseButton variant="ghost" size="sm" class="p-1" tooltip="Delete model" @click="emit('delete')">
              <BaseIcon name="trash" class="size-4" />
            </BaseButton>
          </template>

          <template v-else-if="model.installed && isActive">
            <BaseButton variant="ghost" size="sm" class="p-1" tooltip="Delete model" @click="emit('delete')">
              <BaseIcon name="trash" class="size-4" />
            </BaseButton>
          </template>
        </div>
      </div>

      <div class="text-base-content/60 text-xs">{{ sizeLabel }} · Requires {{ model.requirements.ramGb }}GB RAM</div>

      <div v-if="isDownloading && downloadProgress" class="flex flex-col gap-1">
        <div class="bg-base-300 relative h-1.5 w-full overflow-hidden rounded-full">
          <div
            class="bg-accent absolute top-0 left-0 h-full transition-all duration-200 ease-in-out"
            :style="{width: `${downloadProgress.percent}%`}"
          />
        </div>
        <span class="text-base-content/50 text-xs"> {{ downloadProgress.percent }}% </span>
      </div>
    </div>

    <p v-if="error" class="text-error px-1 text-xs">{{ error }}</p>
  </div>
</template>
