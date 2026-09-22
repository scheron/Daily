<script setup lang="ts">
import {computed} from "vue"

import {useSyncServerStore} from "@/stores/syncServer.store"
import BaseIcon from "@/ui/base/BaseIcon"
import AddDeviceRow from "./{fragments}/AddDeviceRow.vue"
import ConnectAgentRow from "./{fragments}/ConnectAgentRow"
import DeviceTable from "./{fragments}/DeviceTable.vue"
import ServerActions from "./{fragments}/ServerActions.vue"
import ServerHero from "./{fragments}/ServerHero.vue"
import ThisMacTable from "./{fragments}/ThisMacTable.vue"

const syncServerStore = useSyncServerStore()

const binding = computed(() => syncServerStore.binding)

const isAddDeviceShown = computed(() => binding.value?.role === "parent")

const isConnectAgentShown = computed(() => binding.value?.acceptsAgents === true && !syncServerStore.isRevoked)

const isDomainLineShown = computed(() => binding.value?.acceptsAgents === false && !syncServerStore.isRevoked)
</script>

<template>
  <template v-if="binding">
    <ServerHero :binding="binding">
      <template #actions>
        <ServerActions v-if="binding.role" :is-add-device-shown="isAddDeviceShown" :is-connect-agent-shown="isConnectAgentShown" />
      </template>
    </ServerHero>

    <template v-if="binding.role">
      <div class="mt-6 flex flex-col gap-2">
        <p v-if="isDomainLineShown" class="text-base-content/55 flex items-center gap-1.5 text-[13px]">
          <BaseIcon name="info" class="size-3.5 shrink-0" />
          Agents need this server on a domain with a trusted certificate.
        </p>

        <DeviceTable v-if="binding.role === 'parent'" :devices="syncServerStore.membership?.devices ?? []" :agents="syncServerStore.agents" />
        <ThisMacTable v-else :binding="binding" :agents="syncServerStore.agents" />
      </div>

      <AddDeviceRow v-if="isAddDeviceShown" />
      <ConnectAgentRow v-if="isConnectAgentShown" />
    </template>

    <p v-else class="text-base-content/50 py-2 text-xs">Checking this Mac's role…</p>
  </template>
</template>
