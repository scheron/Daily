<script setup lang="ts">
import {useSettingsStore} from "@/stores/settings.store"
import {useStorageStore} from "@/stores/storage.store"
import {useSyncServerStore} from "@/stores/syncServer.store"
import {useBaseModal} from "@/ui/base/BaseModal"

import ICloudDetails from "./{fragments}/ICloudDetails.vue"
import ProviderMigrationModal from "./{fragments}/ProviderMigrationModal.vue"
import ProviderSection from "./{fragments}/ProviderSection.vue"
import ServerDetails from "./{fragments}/ServerDetails.vue"
import SettingsGroup from "../SettingsGroup.vue"

import type {SyncProvider} from "@shared/types/syncProvider"

const MIGRATION_MODAL_ID = "sync-provider-migration"

const storageStore = useStorageStore()
const settingsStore = useSettingsStore()
const syncServerStore = useSyncServerStore()

const {show, hide, isOpen} = useBaseModal(MIGRATION_MODAL_ID)

function onSelect(target: SyncProvider) {
  show(ProviderMigrationModal, {target, onClose: () => hide(), onDone: onDone})
}

async function onDone() {
  hide()
  await Promise.all([settingsStore.revalidate(), syncServerStore.loadState()])
}
</script>

<template>
  <SettingsGroup label="Sync" icon="cloud">
    <ProviderSection :provider="storageStore.provider" :busy="isOpen" @select="onSelect" />

    <ICloudDetails v-if="storageStore.provider === 'icloud'" />
    <ServerDetails v-else-if="storageStore.provider === 'server'" />
    <p v-else class="text-base-content/60 py-2 text-xs">This Mac is not syncing.</p>
  </SettingsGroup>
</template>
