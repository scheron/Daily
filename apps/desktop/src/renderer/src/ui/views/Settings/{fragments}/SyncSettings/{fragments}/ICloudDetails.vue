<script setup lang="ts">
import {computed} from "vue"

import {toLocaleTime} from "@daily/std"

import {useStorageStore} from "@/stores/storage.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import SettingRow from "@/ui/views/Settings/{fragments}/SettingRow.vue"
import {cn} from "@/utils/ui/tailwindcss"

import type {SyncStatus} from "@daily/protocol"

const storageStore = useStorageStore()

const isSyncing = computed(() => storageStore.status === "syncing")

function getDotClasses(status: SyncStatus) {
  const color = status === "active" ? "bg-success" : status === "error" ? "bg-error" : "bg-base-content/30"
  return cn("size-2 rounded-full", color)
}

async function onForceSync() {
  await storageStore.forceSync()
}
</script>

<template>
  <SettingRow>
    <template #title>
      <div class="flex items-center gap-2">
        <p class="text-base-content text-sm">iCloud Sync</p>
        <span class="flex size-4 shrink-0 items-center justify-center">
          <BaseIcon v-if="isSyncing" name="spinner" class="text-accent size-3.5 animate-spin" />
          <span v-else :class="getDotClasses(storageStore.status)" />
        </span>
      </div>
    </template>
    <template #description>
      <span class="text-base-content/40 flex items-center gap-1.5 text-xs">
        <BaseIcon name="stopwatch" class="size-3.5 shrink-0" />
        {{ storageStore.lastSyncAt ? toLocaleTime(storageStore.lastSyncAt) : "Never synced" }}
      </span>
    </template>

    <BaseButton
      variant="ghost"
      class="text-accent hover:bg-accent/10 -mr-1 text-xs"
      icon-class="size-3.5"
      icon="refresh"
      :disabled="isSyncing"
      @click="onForceSync"
    >
      Sync Now
    </BaseButton>
  </SettingRow>
</template>
