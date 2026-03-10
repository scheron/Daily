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
  if (updateStore.state.status === "installing") {
    return "Daily is applying the update now. The app will relaunch automatically when the installation finishes."
  }

  if (updateStore.state.status === "downloading") {
    if (typeof updateStore.state.downloadProgress === "number") {
      return `Downloading version ${updateStore.state.availableVersion} in the background: ${updateStore.state.downloadProgress}%`
    }

    return `Downloading version ${updateStore.state.availableVersion}. The app will relaunch automatically after installing.`
  }

  return `A new version  of Daily is available. Install ${updateStore.state.availableVersion} and the app will relaunch automatically when it's ready.`
})

const progressWidth = computed(() => {
  if (typeof updateStore.state.downloadProgress !== "number") return "0%"
  return `${Math.max(6, Math.min(100, updateStore.state.downloadProgress))}%`
})

async function onInstall() {
  await updateStore.installUpdate()
}
</script>

<template>
  <BaseAnimation name="fade">
    <div
      v-if="updateStore.isPanelVisible"
      class="border-base-300 bg-base-100/90 bottom-header fixed right-4 z-50 flex w-96 flex-col gap-4 rounded-2xl border px-5 py-4 shadow-2xl backdrop-blur-xl"
    >
      <div class="flex items-start gap-3">
        <div class="bg-base-200 text-base-content mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full">
          <BaseIcon :name="updateStore.isUpdating ? 'refresh' : 'info'" :class="updateStore.isUpdating && 'animate-spin'" />
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h3 class="m-0 text-base leading-none font-semibold">
                {{ title }}
              </h3>
              <p class="text-base-content/70 mt-2 pr-4 text-sm leading-snug">
                {{ description }}
              </p>
            </div>

            <BaseButton
              v-if="!updateStore.isUpdating"
              variant="ghost"
              icon="x-mark"
              class="text-base-content/60 hover:text-base-content -mt-1 -mr-2"
              tooltip="Dismiss"
              @click="updateStore.dismissPanel()"
            />
          </div>
        </div>
      </div>

      <div v-if="updateStore.state.status === 'downloading'" class="flex flex-col gap-2">
        <div class="bg-base-200 h-2 overflow-hidden rounded-full">
          <div class="bg-accent h-full rounded-full transition-all duration-200" :style="{width: progressWidth}" />
        </div>
        <span class="text-base-content/60 text-xs">
          {{ typeof updateStore.state.downloadProgress === "number" ? `${updateStore.state.downloadProgress}% downloaded` : "Preparing download..." }}
        </span>
      </div>

      <div class="flex items-center justify-end gap-3">
        <BaseButton
          variant="secondary"
          class="min-w-28 text-sm"
          :loading="updateStore.isUpdating"
          :disabled="updateStore.isUpdating"
          @click="onInstall"
        >
          {{ updateStore.isUpdating ? "Installing" : "Install" }}
        </BaseButton>
      </div>
    </div>
  </BaseAnimation>
</template>
