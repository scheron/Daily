<script setup lang="ts">
import {computed} from "vue"

import {toLocaleTime} from "@daily/std"

import {useStorageStore} from "@/stores/storage.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseSwitch from "@/ui/base/BaseSwitch.vue"

import type {SyncProvider} from "@daily/protocol"

const props = defineProps<{isServerConnected: boolean}>()
const emit = defineEmits<{select: [target: SyncProvider]}>()

const storageStore = useStorageStore()

const isEnabled = computed(() => storageStore.provider === "icloud")

const isSyncing = computed(() => storageStore.status === "syncing")

const statusLabel = computed(() => {
  if (!isEnabled.value) return "Not in use"
  if (isSyncing.value) return "Syncing…"
  return storageStore.lastSyncAt ? `Last synced ${toLocaleTime(storageStore.lastSyncAt)}` : "Never synced"
})

const footnote = computed(() =>
  props.isServerConnected
    ? "A Daily Server takes over from iCloud — disconnect it to sync through iCloud instead."
    : "iCloud is on its way out — a Daily Server does everything it does, and agents can reach it too.",
)

function onToggle(isOn: boolean) {
  emit("select", isOn ? "icloud" : "off")
}

async function onForceSync() {
  await storageStore.forceSync()
}
</script>

<template>
  <div class="border-base-300 flex flex-col gap-2 border-t pt-3.5">
    <div class="flex items-center justify-between gap-6">
      <div class="flex min-w-0 items-center gap-2.5">
        <BaseIcon name="cloud" class="text-base-content/60 size-4 shrink-0" />
        <div class="min-w-0">
          <p class="text-base-content text-sm">iCloud sync</p>
          <p class="text-base-content/60 mt-0.5 text-xs">{{ statusLabel }}</p>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <BaseButton v-if="isEnabled" variant="primary-ghost" size="xs" icon="refresh" :disabled="isSyncing" @click="onForceSync">
          Sync Now
        </BaseButton>
        <span class="text-warning bg-warning/15 rounded-full px-2 py-1 text-[11px] font-medium leading-none">Legacy</span>
        <BaseSwitch :model-value="isEnabled" :disabled="isServerConnected" @update:model-value="onToggle" />
      </div>
    </div>

    <p class="text-base-content/45 text-xs leading-normal">{{ footnote }}</p>
  </div>
</template>
