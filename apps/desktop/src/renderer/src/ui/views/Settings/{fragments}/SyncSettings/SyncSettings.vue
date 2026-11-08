<script setup lang="ts">
import {computed} from "vue"

import {useSettingsStore} from "@/stores/settings"
import {useStorageStore} from "@/stores/storage"
import {useSyncServerStore} from "@/stores/sync-server"
import ICloudDetails from "./{fragments}/ICloudDetails.vue"
import {useProviderMigrationModal} from "./{fragments}/ProviderMigrationModal"
import ServerDetails from "./{fragments}/ServerDetails"
import ServerEmpty from "./{fragments}/ServerEmpty.vue"

import type {SyncProvider} from "@daily/protocol"

const storageStore = useStorageStore()
const settingsStore = useSettingsStore()
const syncServerStore = useSyncServerStore()

const isServerConnected = computed(() => storageStore.provider === "server")

const {open} = useProviderMigrationModal()

function onSelect(target: SyncProvider) {
  open(target, onDone)
}

async function onDone() {
  await Promise.all([settingsStore.revalidate(), syncServerStore.loadState()])
}
</script>

<template>
  <div class="flex flex-1 flex-col py-2">
    <ServerDetails v-if="isServerConnected" />
    <ServerEmpty v-else @connect="onSelect('server')" />

    <div class="mt-auto pt-6">
      <ICloudDetails :is-server-connected="isServerConnected" @select="onSelect" />
    </div>
  </div>
</template>
