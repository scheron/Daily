<script setup lang="ts">
import {computed, ref, watch} from "vue"
import {useTimeoutFn} from "@vueuse/core"
import {storeToRefs} from "pinia"

import {useStorageStore} from "@/stores/storage.store"
import {useSyncServerStore} from "@/stores/syncServer.store"
import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"

const storageStore = useStorageStore()
const syncServerStore = useSyncServerStore()

const {provider} = storeToRefs(storageStore)
const {connection} = storeToRefs(syncServerStore)

const settledLabel = ref<"Connected" | "Reconnected" | null>(null)
const isRetrying = ref(false)

const connectionState = computed<"connecting" | "reconnecting" | "settled" | null>(() => {
  if (provider.value !== "server") return null
  if (connection.value === "connecting") return "connecting"
  if (connection.value === "unreachable") return "reconnecting"
  return settledLabel.value ? "settled" : null
})

const {start: startSettledTimeout, stop: stopSettledTimeout} = useTimeoutFn(() => (settledLabel.value = null), 2500, {immediate: false})

async function onRetry() {
  isRetrying.value = true
  try {
    await syncServerStore.retry()
  } catch (error) {
    console.error("Failed to retry the Daily Sync Server:", error)
  } finally {
    isRetrying.value = false
  }
}

watch(connection, (nextConnection, prevConnection) => {
  stopSettledTimeout()
  settledLabel.value = nextConnection === "connected" ? (prevConnection === "unreachable" ? "Reconnected" : "Connected") : null
  if (settledLabel.value) startSettledTimeout()
})
</script>

<template>
  <BaseAnimation name="fade" :duration="200">
    <div v-if="connectionState" class="flex h-full items-center gap-0.5">
      <span v-if="connectionState === 'connecting'" class="text-base-content/60 flex items-center gap-1.5 whitespace-nowrap px-2 text-xs font-medium">
        <BaseIcon name="spinner-arc" class="size-3.5 animate-spin" />
        Connecting…
      </span>

      <template v-else-if="connectionState === 'reconnecting'">
        <span class="text-warning flex items-center gap-1.5 whitespace-nowrap pl-2 pr-0.5 text-xs font-medium">
          <BaseIcon name="spinner-arc" class="size-3.5 animate-spin" />
          Reconnecting…
        </span>
        <BaseButton variant="warning-ghost" icon="refresh" size="sm" tooltip="Try again" :loading="isRetrying" @click="onRetry" />
      </template>

      <span v-else class="text-success flex items-center gap-1.5 whitespace-nowrap px-2 text-xs font-medium">
        <BaseIcon name="check" class="size-3.5" />
        {{ settledLabel }}
      </span>

      <div class="bg-base-300 h-4.5 mx-0.5 w-px" />
    </div>
  </BaseAnimation>
</template>
