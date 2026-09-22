<script setup lang="ts">
import {computed} from "vue"

import {useSettingsStore} from "@/stores/settings.store"
import {useStorageStore} from "@/stores/storage.store"
import {useSyncServerStore} from "@/stores/syncServer.store"
import {useBaseModal} from "@/ui/base/BaseModal"
import ICloudDetails from "./{fragments}/ICloudDetails.vue"
import ProviderMigrationModal from "./{fragments}/ProviderMigrationModal"
import ServerDetails from "./{fragments}/ServerDetails"
import ServerEmpty from "./{fragments}/ServerEmpty.vue"

import type {SyncProvider} from "@daily/protocol"

const storageStore = useStorageStore()
const settingsStore = useSettingsStore()
const syncServerStore = useSyncServerStore()

const {show, hide} = useBaseModal("sync-provider-migration")

const isServerConnected = computed(() => storageStore.provider === "server")

function onSelect(target: SyncProvider) {
  show(ProviderMigrationModal, {target, onClose: () => hide(), onDone: onDone})
}

async function onDone() {
  hide()
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
