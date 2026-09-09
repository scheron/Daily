<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from "vue"

import {useSyncServerStore} from "@/stores/syncServer.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"

const TICK_MS = 1_000
const LAST_MINUTE_MS = 60_000

const syncServerStore = useSyncServerStore()

const now = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | null = null

const expiresAt = computed(() => syncServerStore.membership?.enrollmentWindow?.expiresAt ?? null)

const isWaiting = computed(() => expiresAt.value !== null)

const remainingMs = computed(() => {
  if (!expiresAt.value) return 0
  return Math.max(0, Date.parse(expiresAt.value) - now.value)
})

const isLastMinute = computed(() => remainingMs.value <= LAST_MINUTE_MS)

const countdownLabel = computed(() => {
  const totalSeconds = Math.ceil(remainingMs.value / 1_000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
})

async function onOpen() {
  try {
    await syncServerStore.openEnrollmentWindow()
  } catch (error) {
    console.error("Failed to open the enrollment window:", error)
  }
}

async function onCancel() {
  try {
    await syncServerStore.closeEnrollmentWindow()
  } catch (error) {
    console.error("Failed to close the enrollment window:", error)
  }
}

function startTicking() {
  stopTicking()
  tickTimer = setInterval(onTick, TICK_MS)
}

function stopTicking() {
  if (tickTimer) clearInterval(tickTimer)
  tickTimer = null
}

async function onTick() {
  now.value = Date.now()
  if (remainingMs.value > 0) return

  stopTicking()
  try {
    await syncServerStore.listMembership()
  } catch (error) {
    console.error("Failed to refresh the Daily Sync Server's membership:", error)
  }
  if (expiresAt.value) startTicking()
}

watch(
  expiresAt,
  (value) => {
    now.value = Date.now()
    if (value) startTicking()
    else stopTicking()
  },
  {immediate: true},
)

onBeforeUnmount(() => stopTicking())
</script>

<template>
  <button
    v-if="!isWaiting"
    type="button"
    class="border-base-300 text-base-content/55 hover:text-accent hover:bg-accent/8 flex h-[50px] w-full items-center justify-center gap-1.5 border-t text-[13px] transition-colors"
    @click="onOpen"
  >
    <BaseIcon name="plus" class="size-3.5" />
    Add a device
  </button>

  <div v-else class="border-base-300 bg-base-200 -mx-6 flex items-center justify-between gap-6 border-b border-t px-6 py-[13px]">
    <div class="flex min-w-0 flex-col gap-0.5">
      <p class="text-base-content text-sm font-medium">Waiting for the other Mac to ask</p>
      <p class="text-base-content/60 text-xs">
        On that Mac: <span class="text-base-content/85 font-medium">Settings → Sync → Self-hosted</span>, then this server's address.
      </p>
    </div>
    <div class="flex shrink-0 items-center gap-2.5">
      <span class="flex items-center gap-1.5 text-[13px] tabular-nums" :class="isLastMinute ? 'text-warning' : 'text-base-content/50'">
        <BaseIcon name="spinner-arc" class="size-3.5 animate-spin" />
        {{ countdownLabel }} left
      </span>
      <BaseButton variant="ghost" size="sm" @click="onCancel">Cancel</BaseButton>
    </div>
  </div>
</template>
