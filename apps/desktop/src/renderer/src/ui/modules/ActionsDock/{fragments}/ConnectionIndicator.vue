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
const {isReachable} = storeToRefs(syncServerStore)

const isReconnected = ref(false)
const isRetrying = ref(false)

const connectionState = computed<"reconnecting" | "reconnected" | null>(() => {
  if (provider.value !== "server") return null
  if (!isReachable.value) return "reconnecting"
  return isReconnected.value ? "reconnected" : null
})

const {start: startReconnectedTimeout, stop: stopReconnectedTimeout} = useTimeoutFn(() => (isReconnected.value = false), 2500, {immediate: false})

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

watch(isReachable, (nextIsReachable) => {
  stopReconnectedTimeout()
  isReconnected.value = nextIsReachable
  if (nextIsReachable) startReconnectedTimeout()
})
</script>

<template>
  <BaseAnimation name="fade" :duration="200">
    <div v-if="connectionState" class="flex h-full items-center gap-0.5">
      <template v-if="connectionState === 'reconnecting'">
        <span class="text-warning flex items-center gap-1.5 pr-0.5 pl-2 text-xs font-medium whitespace-nowrap">
          <BaseIcon name="spinner-arc" class="size-3.5 animate-spin" />
          Reconnecting…
        </span>
        <BaseButton variant="warning-ghost" icon="refresh" size="sm" tooltip="Try again" :loading="isRetrying" @click="onRetry" />
      </template>

      <span v-else class="text-success flex items-center gap-1.5 px-2 text-xs font-medium whitespace-nowrap">
        <BaseIcon name="check" class="size-3.5" />
        Reconnected
      </span>

      <div class="bg-base-300 mx-0.5 h-4.5 w-px" />
    </div>
  </BaseAnimation>
</template>
