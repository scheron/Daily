<script setup lang="ts">
import {computed} from "vue"

import {useUpdateStore} from "@/stores/update.store"
import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"

const updateStore = useUpdateStore()

const title = computed(() => {
  if (updateStore.state.status === "installing") return "Installing update"
  if (updateStore.state.status === "downloading") return "Downloading update"
  return "Update available"
})

const description = computed(() => {
  if (updateStore.state.status === "installing") return "Installing the update. The app will relaunch automatically."
  if (updateStore.state.status === "downloading") return "Downloading the update."
  return "A new version of Daily is available. The app will relaunch automatically after installing."
})

const progressWidth = computed(() => {
  if (typeof updateStore.state.downloadProgress !== "number") return "0%"
  return `${Math.max(6, Math.min(100, updateStore.state.downloadProgress))}%`
})

const buttonLabel = computed(() => {
  if (updateStore.isDownloading) return "Downloading"
  if (updateStore.isInstalling) return "Installing"
  return "Download"
})

function handlePrimaryAction() {
  return updateStore.downloadUpdate()
}
</script>

<template>
  <BaseAnimation name="fade">
    <div
      v-if="updateStore.isPanelVisible"
      class="border-base-300 bg-base-100/90 bottom-header fixed right-4 z-50 flex w-80 flex-col rounded-2xl border px-4 py-3 shadow-2xl"
    >
      <div class="mb-2 flex w-full flex-col gap-2">
        <div class="flex w-full items-center justify-between gap-2">
          <div class="flex items-center gap-1">
            <span class="bg-base-200 text-base-content flex size-6 shrink-0 items-center justify-center rounded-full">
              <BaseIcon :name="updateStore.isBusy ? 'refresh' : 'info'" :class="updateStore.isBusy && 'animate-spin'" class="size-4" />
            </span>

            <h3 class="text-sm font-semibold">
              {{ title }}
            </h3>
          </div>

          <BaseButton
            v-if="!updateStore.isBusy"
            variant="ghost"
            icon="x-mark"
            class="text-base-content/60 hover:text-base-content p-0"
            icon-class="size-4"
            tooltip="Dismiss"
            @click="updateStore.dismissPanel()"
          />
        </div>

        <p class="text-base-content/70 ml-6.5 text-sm leading-snug">
          {{ description }}
        </p>
      </div>

      <div v-if="updateStore.state.status === 'downloading'" class="mt-2 flex flex-col gap-2">
        <div class="bg-base-300 h-2 overflow-hidden rounded-full">
          <div class="bg-accent h-full rounded-full transition-all duration-200" :style="{width: progressWidth}" />
        </div>
        <span class="text-base-content/60 self-end text-xs">
          {{ typeof updateStore.state.downloadProgress === "number" ? `${updateStore.state.downloadProgress}% downloaded` : "Preparing download..." }}
        </span>
      </div>

      <div v-if="!updateStore.isBusy" class="flex items-center justify-end gap-3">
        <BaseButton variant="secondary" class="min-w-28 py-1 text-sm" @click="handlePrimaryAction">
          {{ buttonLabel }}
        </BaseButton>
      </div>
    </div>
  </BaseAnimation>
</template>
