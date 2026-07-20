<script setup lang="ts">
import {computed} from "vue"

import {useSettingsStore} from "@/stores/settings.store"
import {useStorageStore} from "@/stores/storage.store"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseSwitch from "@/ui/base/BaseSwitch.vue"

import SettingRow from "../../SettingRow.vue"

const settingsStore = useSettingsStore()
const storageStore = useStorageStore()

const isSyncEnabled = computed(() => settingsStore.settings?.sync.iCloud.enabled ?? false)
const isSyncing = computed(() => storageStore.status === "syncing" && isSyncEnabled.value)

const dotClass = computed(() => {
  if (storageStore.status === "active") return "bg-success"
  if (storageStore.status === "error") return "bg-error"
  return "bg-base-content/30"
})

function onToggleAutoSync(enabled: boolean) {
  const sync = settingsStore.settings?.sync
  if (!sync) return
  settingsStore.updateSettings({sync: {...sync, iCloud: {enabled}}})
}
</script>

<template>
  <SettingRow description="Sync your data through iCloud on this device">
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
