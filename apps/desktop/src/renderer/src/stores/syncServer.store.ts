import {ref} from "vue"
import {invoke} from "@vueuse/core"
import {defineStore} from "pinia"

import {useBaseModal} from "@/ui/base/BaseModal"
import ApproveDeviceModal from "@/ui/overlays/ApproveDeviceModal.vue"

import type {
  EnrollmentPollView,
  EnrollmentTicketView,
  EnrollmentWindowView,
  PendingApprovalView,
  ProtocolMismatchView,
  ServerBindingView,
  ServerMembershipView,
  ServerProbeView,
} from "@daily/protocol"

export const useSyncServerStore = defineStore("syncServer", () => {
  const binding = ref<ServerBindingView | null>(null)
  const isRevoked = ref(false)
  const mismatch = ref<ProtocolMismatchView | null>(null)
  const membership = ref<ServerMembershipView | null>(null)
  let isWatchingApprovals = false

  const {show: showApproval, hide: hideApproval} = useBaseModal("sync-server-approve-device")

  window.BridgeIPC["sync-server:on-revoked"](() => {
    isRevoked.value = true
  })

  window.BridgeIPC["sync-server:on-protocol-mismatch-changed"]((nextMismatch) => {
    mismatch.value = nextMismatch
  })

  window.BridgeIPC["sync-server:on-role-changed"]((role) => {
    if (binding.value) binding.value.role = role
    listMembership()
  })

  async function loadState(): Promise<void> {
    try {
      const state = await window.BridgeIPC["sync-server:get-state"]()
      binding.value = state.binding
      isRevoked.value = state.revoked
      mismatch.value = state.mismatch
      if (binding.value?.role === "parent") await listMembership()
    } catch (error) {
      console.error("Failed to load the Daily Sync Server state:", error)
    }
  }

  async function listMembership(): Promise<void> {
    try {
      membership.value = await window.BridgeIPC["sync-server:list-membership"]()
    } catch (error) {
      console.error("Failed to load the Daily Sync Server's membership:", error)
    }
  }

  async function revokeDevice(deviceId: string): Promise<ServerMembershipView> {
    const result = await window.BridgeIPC["sync-server:revoke-device"](deviceId)
    membership.value = result
    return result
  }

  async function openEnrollmentWindow(): Promise<EnrollmentWindowView> {
    const result = await window.BridgeIPC["sync-server:open-enrollment-window"]()
    await listMembership()
    return result
  }

  async function closeEnrollmentWindow(): Promise<void> {
    await window.BridgeIPC["sync-server:close-enrollment-window"]()
    await listMembership()
  }

  async function defaultDeviceName(): Promise<string> {
    return window.BridgeIPC["sync-server:default-device-name"]()
  }

  async function probe(baseUrl: string): Promise<ServerProbeView> {
    return window.BridgeIPC["sync-server:probe"](baseUrl)
  }

  async function claim(code: string, deviceName: string, isInsecureConfirmed: boolean): Promise<ServerBindingView> {
    const result = await window.BridgeIPC["sync-server:claim"](code, deviceName, isInsecureConfirmed)
    await loadState()
    return result
  }

  async function requestEnrollment(deviceName: string, isInsecureConfirmed: boolean): Promise<EnrollmentTicketView> {
    return window.BridgeIPC["sync-server:request-enrollment"](deviceName, isInsecureConfirmed)
  }

  async function pollEnrollment(): Promise<EnrollmentPollView> {
    const result = await window.BridgeIPC["sync-server:poll-enrollment"]()
    if (result.state === "approved") await loadState()
    return result
  }

  async function cancelConnection(): Promise<void> {
    try {
      await window.BridgeIPC["sync-server:cancel-connection"]()
    } catch (error) {
      console.error("Failed to cancel the connection attempt:", error)
    }
  }

  async function disconnect(): Promise<void> {
    await window.BridgeIPC["sync-server:disconnect"]()
    await loadState()
  }

  async function getPendingApproval(): Promise<PendingApprovalView | null> {
    return window.BridgeIPC["sync-server:get-pending-approval"]()
  }

  async function approve(requestId: string, code: string): Promise<void> {
    await window.BridgeIPC["sync-server:approve"](requestId, code)
    await listMembership()
  }

  async function deny(requestId: string): Promise<void> {
    await window.BridgeIPC["sync-server:deny"](requestId)
  }

  async function openApprovalDialog(): Promise<void> {
    const pending = await getPendingApproval()
    if (!pending) return

    showApproval(ApproveDeviceModal, {
      request: pending,
      onApprove: async () => {
        try {
          await approve(pending.requestId, pending.code)
        } catch (error) {
          console.error("Failed to approve the device:", error)
        }
        hideApproval()
      },
      onDeny: async () => {
        try {
          await deny(pending.requestId)
        } catch (error) {
          console.error("Failed to deny the device:", error)
        }
        hideApproval()
      },
      onClose: () => hideApproval(),
    })
  }

  /**
   * The subscription is set up only once; a request that arrived before anything was listening
   * is still opened. Each window that calls this shows its own card, and acting on a card already
   * resolved in another window fails but still closes it.
   */
  function watchForApprovals(): void {
    if (isWatchingApprovals) return
    isWatchingApprovals = true

    window.BridgeIPC["sync-server:on-approval-requested"](() => {
      openApprovalDialog()
    })
    openApprovalDialog()
  }

  invoke(loadState)

  return {
    binding,
    isRevoked,
    mismatch,
    membership,

    loadState,
    listMembership,
    revokeDevice,
    openEnrollmentWindow,
    closeEnrollmentWindow,
    defaultDeviceName,
    probe,
    claim,
    requestEnrollment,
    pollEnrollment,
    cancelConnection,
    disconnect,
    watchForApprovals,
  }
})
