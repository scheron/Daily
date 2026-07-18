<script setup lang="ts">
import {computed} from "vue"

import {useStorageStore} from "@/stores/storage.store"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseSwitch from "@/ui/base/BaseSwitch.vue"

import SettingRow from "../../SettingRow.vue"

const storageStore = useStorageStore()

const isSyncEnabled = computed(() => ["active", "syncing"].includes(storageStore.status))
const isSyncing = computed(() => storageStore.status === "syncing")

const dotClass = computed(() => {
  if (storageStore.status === "active") return "bg-success"
  if (storageStore.status === "error") return "bg-error"
  return "bg-base-content/30"
})

async function onToggleAutoSync(value: boolean) {
  if (value) {
    await storageStore.activateSync()
  } else {
    await storageStore.deactivateSync()
  }
}
</script>

<template>
  <SettingRow description="Sync your data across devices">
    <template #title>
      <div class="flex items-center gap-2">
        <p class="text-base-content text-sm">iCloud Sync</p>

        <span class="flex size-4 shrink-0 items-center justify-center">
          <BaseIcon v-if="isSyncing" name="spinner" class="text-accent size-3.5 animate-spin" />
          <span v-else class="size-2 rounded-full" :class="dotClass" />
        </span>
      </div>
    </template>

    <BaseSwitch :modelValue="isSyncEnabled" :disabled="isSyncing" @update:modelValue="onToggleAutoSync" />
  </SettingRow>
</template>
