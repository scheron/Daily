<script setup lang="ts">
import {computed} from "vue"

import {useSyncServerStore} from "@/stores/syncServer.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import {useWindowCountdown} from "../useWindowCountdown"

const syncServerStore = useSyncServerStore()

const expiresAt = computed(() => syncServerStore.membership?.enrollmentWindow?.expiresAt ?? null)

const isWaiting = computed(() => expiresAt.value !== null)

const {countdownLabel, countdownClass} = useWindowCountdown(expiresAt, syncServerStore.listMembership)

async function onCancel() {
  try {
    await syncServerStore.closeEnrollmentWindow()
  } catch (error) {
    console.error("Failed to close the enrollment window:", error)
  }
}
</script>

<template>
  <div v-if="isWaiting" class="border-base-300 bg-base-200 -mx-6 flex items-center justify-between gap-6 border-t border-b px-6 py-[13px]">
    <div class="flex min-w-0 flex-col gap-0.5">
      <p class="text-base-content text-sm font-medium">Waiting for the other Mac to ask</p>
      <p class="text-base-content/60 text-xs">
        On that Mac: <span class="text-base-content/85 font-medium">Settings → Sync → Self-hosted</span>, then this server's address.
      </p>
    </div>
    <div class="flex shrink-0 items-center gap-2.5">
      <span :class="countdownClass">
        <BaseIcon name="spinner-arc" class="size-3.5 animate-spin" />
        {{ countdownLabel }} left
      </span>
      <BaseButton variant="ghost" @click="onCancel">Cancel</BaseButton>
    </div>
  </div>
</template>
