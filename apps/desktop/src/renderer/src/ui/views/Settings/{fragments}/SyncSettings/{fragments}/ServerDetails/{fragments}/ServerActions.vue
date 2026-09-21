<script setup lang="ts">
import {computed} from "vue"

import {useSyncServerStore} from "@/stores/syncServer.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import AddDeviceRow from "./AddDeviceRow.vue"
import ConnectAgentRow from "./ConnectAgentRow.vue"

const props = defineProps<{isAddDeviceShown: boolean; isConnectAgentShown: boolean; isDomainLineShown: boolean}>()

const syncServerStore = useSyncServerStore()

const isEnrollmentWaiting = computed(() => Boolean(syncServerStore.membership?.enrollmentWindow))

const isAgentWaiting = computed(() => syncServerStore.agentWindow?.isThisMac === true)

const hasRow = computed(() => props.isAddDeviceShown || props.isConnectAgentShown || props.isDomainLineShown)

async function onAddDevice() {
  try {
    await syncServerStore.openEnrollmentWindow()
  } catch (error) {
    console.error("Failed to open the enrollment window:", error)
  }
}

async function onConnectAgent() {
  try {
    await syncServerStore.openAgentWindow()
  } catch (error) {
    console.error("Failed to open the Agent window:", error)
  }
}
</script>

<template>
  <div v-if="hasRow" class="border-base-300 flex items-center gap-2 border-t py-3">
    <BaseButton v-if="isAddDeviceShown" variant="dashed" icon="plus" class="flex-1" :disabled="isEnrollmentWaiting" @click="onAddDevice">
      Add a device
    </BaseButton>
    <BaseButton v-if="isConnectAgentShown" variant="dashed" icon="plus" class="flex-1" :disabled="isAgentWaiting" @click="onConnectAgent">
      Connect an agent
    </BaseButton>
    <p v-else-if="isDomainLineShown" class="text-base-content/55 flex flex-1 items-center justify-center gap-1.5 text-center text-[13px]">
      <BaseIcon name="info" class="size-3.5 shrink-0" />
      Agents need this server on a domain with a trusted certificate.
    </p>
  </div>

  <AddDeviceRow v-if="isAddDeviceShown" />
  <ConnectAgentRow v-if="isConnectAgentShown" />
</template>
