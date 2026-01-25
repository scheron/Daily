<script setup lang="ts">
import {toLocaleTime} from "@shared/utils/date/formatters"
import {useStorageStore} from "@/stores/storage.store"
import {SYNC_STATUS_ENUM} from "@/constants/sync"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseSwitch from "@/ui/base/BaseSwitch.vue"

const storageStore = useStorageStore()

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
  <div class="flex h-full flex-col gap-4 px-4 py-4">
    <h3 class="text-base-content text-sm font-semibold">iCloud Sync</h3>
    <div class="flex flex-col gap-3">
      <div class="flex items-center justify-between gap-3">
        <div class="flex flex-1 items-center gap-2">
          <BaseIcon
            :name="SYNC_STATUS_ENUM[storageStore.status].icon"
            class="size-6 shrink-0"
            :class="[SYNC_STATUS_ENUM[storageStore.status].color, {'animate-spin': storageStore.status === 'syncing'}]"
          />
          <div class="flex flex-col gap-0.5">
            <span class="text-sm font-medium" :class="SYNC_STATUS_ENUM[storageStore.status].color">{{
              SYNC_STATUS_ENUM[storageStore.status].text
            }}</span>
            <span class="text-base-content/50 text-xs">{{ SYNC_STATUS_ENUM[storageStore.status].description }}</span>
          </div>
        </div>

        <BaseSwitch
          :modelValue="['active', 'syncing'].includes(storageStore.status)"
          :disabled="storageStore.status === 'syncing'"
          @update:modelValue="onToggleAutoSync"
        />
      </div>

      <template v-if="['active', 'syncing'].includes(storageStore.status)">
        <div class="border-base-300 flex flex-col gap-2 rounded-md border p-3">
          <div class="text-base-content/50 flex items-center justify-between text-xs">
            <span class="flex items-center gap-1.5">
              <BaseIcon name="stopwatch" class="size-4 shrink-0" />
              Last sync:
            </span>
            <span class="text-base-content">
              {{ storageStore.lastSyncAt ? toLocaleTime(storageStore.lastSyncAt!) : "-" }}
            </span>
          </div>

          <BaseButton
            variant="outline"
            size="sm"
            class="border-accent text-accent mt-1 w-full text-xs"
            icon-class="size-4"
            icon="refresh"
            :disabled="storageStore.status === 'syncing'"
            @click="onForceSync"
          >
            Sync Now
          </BaseButton>
        </div>
      </template>

      <div class="border-base-300 mt-2 flex flex-col gap-2 rounded-md border p-3">
        <p class="text-base-content/60 text-xs leading-relaxed">
          When enabled, your tasks, tags, and settings are automatically synced to iCloud. This allows to access data on multiple devices.
        </p>
      </div>
    </div>
  </div>
</template>
