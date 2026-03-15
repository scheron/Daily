<script setup lang="ts">
import {computed} from "vue"

import {toLocaleTime} from "@shared/utils/date/formatters"
import {useStorageStore} from "@/stores/storage.store"
import {SYNC_STATUS_ENUM} from "@/constants/sync"
import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseCard from "@/ui/base/BaseCard.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseSwitch from "@/ui/base/BaseSwitch.vue"

const storageStore = useStorageStore()

const isSyncEnabled = computed(() => ["active", "syncing"].includes(storageStore.status))
const isSyncing = computed(() => storageStore.status === "syncing")
const statusConfig = computed(() => SYNC_STATUS_ENUM[storageStore.status])

async function onToggleAutoSync(value: boolean) {
  if (value) {
    await storageStore.activateSync()
  } else {
    await storageStore.deactivateSync()
  }
}

async function onForceSync() {
  await storageStore.forceSync()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <BaseCard title="Enable iCloud Sync" description="Sync your data across devices">
      <BaseSwitch :modelValue="isSyncEnabled" :disabled="isSyncing" @update:modelValue="onToggleAutoSync" />
    </BaseCard>

    <BaseAnimation name="dropIn" :duration="250">
      <div v-if="isSyncEnabled" class="overflow-hidden">
        <div class="flex items-center gap-2.5 py-2.5">
          <span class="relative flex items-center justify-center">
            <BaseIcon :name="statusConfig.icon" class="size-4 shrink-0" :class="[statusConfig.color, {'animate-spin': isSyncing}]" />
            <span
              v-if="storageStore.status === 'active'"
              class="bg-success/40 absolute size-4 animate-ping rounded-full opacity-0"
              style="animation-duration: 3s; animation-iteration-count: 1; animation-fill-mode: forwards"
            />
          </span>

          <span class="text-sm font-medium" :class="statusConfig.color">
            {{ statusConfig.text }}
          </span>

          <span class="text-base-content/35 ml-auto text-[10px] tracking-wide">
            {{ statusConfig.description }}
          </span>
        </div>

        <div class="border-base-300 flex items-center justify-between border-t py-1">
          <span class="text-base-content/40 flex items-center gap-1.5 text-xs">
            <BaseIcon name="stopwatch" class="size-3.5 shrink-0" />
            {{ storageStore.lastSyncAt ? toLocaleTime(storageStore.lastSyncAt!) : "Never synced" }}
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
      </div>
    </BaseAnimation>
  </div>
</template>
