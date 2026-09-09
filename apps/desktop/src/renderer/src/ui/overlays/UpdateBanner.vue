<script setup lang="ts">
import {computed, ref, watch} from "vue"

import {isNumber} from "@daily/std"

import {useUpdateStore} from "@/stores/update.store"
import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"
import {UpdateInstallFailureCode} from "@shared/errors/updates/UpdateInstallFailureCode"

const FAILURE_DETAILS: Record<UpdateInstallFailureCode, string> = {
  [UpdateInstallFailureCode.MountFailed]: "The downloaded file could not be opened.",
  [UpdateInstallFailureCode.SourceMissing]: "The download did not contain a usable copy of Daily.",
  [UpdateInstallFailureCode.CopyFailed]: "The new version could not be copied into place.",
  [UpdateInstallFailureCode.CopyIncomplete]: "The copy of the new version came out incomplete.",
  [UpdateInstallFailureCode.InstalledBundleUnusable]: "The new version would not start.",
  [UpdateInstallFailureCode.Interrupted]: "The update stopped partway through.",
}

const updateStore = useUpdateStore()

const isDetailsOpen = ref(false)

const hasInstallFailure = computed(() => Boolean(updateStore.installFailure) && !updateStore.isBusy)

const title = computed(() => {
  if (updateStore.state.status === "installing") return "Installing update"
  if (updateStore.state.status === "downloading") return "Downloading update"
  if (hasInstallFailure.value) return "Update couldn't be installed"
  return "Update available"
})

const description = computed(() => {
  if (updateStore.state.status === "installing") return "Installing the update. The app will relaunch automatically."
  if (updateStore.state.status === "downloading") return "Downloading the update."
  if (hasInstallFailure.value) {
    return "Daily is running the version it had before. Your tasks and settings are untouched, and the download is still ready — try again."
  }
  return "A new version of Daily is available. The app will relaunch automatically after installing."
})

const failureDetail = computed(() => {
  const failure = updateStore.installFailure
  if (!failure) return null
  return FAILURE_DETAILS[failure.code] ?? FAILURE_DETAILS[UpdateInstallFailureCode.Interrupted]
})

const statusIcon = computed(() => {
  if (updateStore.isBusy) return "spinner"
  if (hasInstallFailure.value) return "alert-triangle"
  return "info"
})

const progressWidth = computed(() => {
  if (!isNumber(updateStore.state.downloadProgress)) return "0%"
  return `${Math.max(6, Math.min(100, updateStore.state.downloadProgress))}%`
})

const buttonLabel = computed(() => {
  if (updateStore.isDownloading) return "Downloading"
  if (updateStore.isInstalling) return "Installing"
  if (hasInstallFailure.value) return "Try again"
  return "Download & Install"
})

const progressLabel = computed(() =>
  isNumber(updateStore.state.downloadProgress) ? `${updateStore.state.downloadProgress}% downloaded` : "Preparing download...",
)

watch(hasInstallFailure, (value) => {
  if (!value) isDetailsOpen.value = false
})

function handlePrimaryAction() {
  return updateStore.downloadUpdate()
}

function getStatusIconClasses(isBusy: boolean, hasFailure: boolean) {
  return cn("size-4", isBusy && "animate-spin", hasFailure && "text-warning")
}
</script>

<template>
  <BaseAnimation name="fade">
    <Teleport to="body">
      <div
        v-if="updateStore.isPanelVisible"
        class="border-base-300 bg-base-100/90 fixed right-4 bottom-4 z-50 flex w-96 flex-col rounded-2xl border px-4 py-3 shadow-2xl"
      >
        <div class="mb-4 flex w-full flex-col gap-2">
          <div class="flex w-full items-center justify-between gap-2">
            <div class="flex items-center gap-1">
              <span class="text-base-content flex size-6 shrink-0 items-center justify-center rounded-full">
                <BaseIcon :name="statusIcon" :class="getStatusIconClasses(updateStore.isBusy, hasInstallFailure)" />
              </span>

              <h3 class="text-sm font-semibold">
                {{ title }}
              </h3>
            </div>

            <BaseButton
              v-if="!updateStore.isBusy"
              variant="ghost-muted"
              icon="x-mark"
              size="xs"
              tooltip="Dismiss"
              @click="updateStore.dismissPanel()"
            />
          </div>

          <p class="text-base-content/70 ml-6.5 text-sm leading-snug">
            {{ description }}
          </p>

          <div v-if="hasInstallFailure" class="ml-6.5 flex flex-col gap-1">
            <button
              type="button"
              class="text-base-content/60 hover:text-base-content flex items-center gap-1 self-start text-xs"
              @click="isDetailsOpen = !isDetailsOpen"
            >
              <BaseIcon :name="isDetailsOpen ? 'chevron-up' : 'chevron-down'" class="size-3" />
              What happened?
            </button>

            <p v-if="isDetailsOpen" class="text-base-content/60 text-xs leading-snug">
              {{ failureDetail }}
              <span class="tabular-nums">Version {{ updateStore.installFailure?.version }}.</span>
            </p>
          </div>
        </div>

        <div v-if="updateStore.state.status === 'downloading'" class="flex flex-col gap-2">
          <div class="bg-base-300 h-2 overflow-hidden rounded-full">
            <div class="bg-accent h-full rounded-full transition-all duration-200" :style="{width: progressWidth}" />
          </div>
          <span class="text-base-content/60 self-end text-xs">{{ progressLabel }}</span>
        </div>

        <div v-if="!updateStore.isBusy" class="flex items-center justify-end gap-3">
          <BaseButton variant="secondary" size="sm" class="min-w-28" @click="handlePrimaryAction">
            {{ buttonLabel }}
          </BaseButton>
        </div>
      </div>
    </Teleport>
  </BaseAnimation>
</template>
