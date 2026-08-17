<script setup lang="ts">
import {computed} from "vue"

import {toLocaleTime} from "@shared/utils/date/formatters"
import {useSettingsStore} from "@/stores/settings.store"
import {useStorageStore} from "@/stores/storage.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"

import ServerSyncSection from "./{fragments}/ServerSyncSection.vue"
import SyncSection from "./{fragments}/SyncSection.vue"
import SettingsGroup from "../SettingsGroup.vue"

const storageStore = useStorageStore()
const settingsStore = useSettingsStore()

const isSyncing = computed(() => storageStore.status === "syncing")
const isICloudEnabled = computed(() => settingsStore.settings?.sync.iCloud.enabled ?? false)

async function onForceSync() {
  await storageStore.forceSync()
}
</script>

<template>
  <div class="flex flex-col gap-8 py-2">
    <SettingsGroup label="Sync" icon="cloud">
      <SyncSection />

      <div v-if="isICloudEnabled" class="border-base-300 mt-8 flex items-center justify-between border-t py-1">
        <span class="text-base-content/40 flex items-center gap-1.5 text-xs">
          <BaseIcon name="stopwatch" class="size-3.5 shrink-0" />
          {{ storageStore.lastSyncAt ? toLocaleTime(storageStore.lastSyncAt) : "Never synced" }}
        </span>

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
      </div>
    </SettingsGroup>

    <SettingsGroup label="Self-hosted Daily" icon="cloud">
      <ServerSyncSection />
    </SettingsGroup>
  </div>
</template>
