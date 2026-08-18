<script setup lang="ts">
import {computed} from "vue"

import {toLocaleTime} from "@shared/utils/date/formatters"
import {useStorageStore} from "@/stores/storage.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"

import SettingRow from "../../SettingRow.vue"

const storageStore = useStorageStore()

const isSyncing = computed(() => storageStore.status === "syncing")

const dotClass = computed(() => {
  if (storageStore.status === "active") return "bg-success"
  if (storageStore.status === "error") return "bg-error"
  return "bg-base-content/30"
})

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
          <span v-else class="size-2 rounded-full" :class="dotClass" />
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
      size="sm"
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
