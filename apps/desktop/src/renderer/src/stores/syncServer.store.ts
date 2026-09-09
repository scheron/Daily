import {ref} from "vue"
import {invoke} from "@vueuse/core"
import {defineStore} from "pinia"

import {useBaseModal} from "@/ui/base/BaseModal"
import ApproveDeviceModal from "@/ui/views/Settings/{fragments}/SyncSettings/{fragments}/ApproveDeviceModal.vue"

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

const APPROVE_DEVICE_MODAL_ID = "sync-server-approve-device"

export const useSyncServerStore = defineStore("syncServer", () => {
  const binding = ref<ServerBindingView | null>(null)
  const revoked = ref(false)
  const mismatch = ref<ProtocolMismatchView | null>(null)
  const membership = ref<ServerMembershipView | null>(null)
  let isWatchingApprovals = false

  const {show: showApproval, hide: hideApproval} = useBaseModal(APPROVE_DEVICE_MODAL_ID)

  async function loadState(): Promise<void> {
    try {
      const state = await window.BridgeIPC["sync-server:get-state"]()
      binding.value = state.binding
      revoked.value = state.revoked
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

  async function claim(code: string, deviceName: string, confirmInsecure: boolean): Promise<ServerBindingView> {
    const result = await window.BridgeIPC["sync-server:claim"](code, deviceName, confirmInsecure)
    await loadState()
    return result
  }

  async function requestEnrollment(deviceName: string, confirmInsecure: boolean): Promise<EnrollmentTicketView> {
    return window.BridgeIPC["sync-server:request-enrollment"](deviceName, confirmInsecure)
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
   * Subscribes to a peer's enrollment request and opens the dialog for it: the edge (a fresh
   * broadcast) and the level (one already waiting when this runs) both resolve through the same
   * `openApprovalDialog()` check, so a request that arrived while nothing was listening — the
   * app was closed, or open only in a window that never called this — is still found once this
   * does run.
   *
   * The broadcast reaches every window's renderer process. `App.vue` calls this from both the
   * main window and Settings — each shows membership or approves on the person's behalf, so each
   * needs its own card — but never from Assistant. When both are open at once, both cards open
   * for the same request; acting on whichever one is stale fails against a request the other
   * window already resolved, and `onApprove`/`onDeny` above close the card on that failure the
   * same as on success, so the stale card never sits unresponsive.
   */
  function watchForApprovals(): void {
    if (isWatchingApprovals) return
    isWatchingApprovals = true

    window.BridgeIPC["sync-server:on-approval-requested"](() => {
      openApprovalDialog()
    })
    openApprovalDialog()
  }

  window.BridgeIPC["sync-server:on-revoked"](() => {
    revoked.value = true
  })

  window.BridgeIPC["sync-server:on-protocol-mismatch-changed"]((nextMismatch) => {
    mismatch.value = nextMismatch
  })

  window.BridgeIPC["sync-server:on-role-changed"]((role) => {
    if (binding.value) binding.value.role = role
    listMembership()
  })

  invoke(loadState)

  return {
    binding,
    revoked,
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
    getPendingApproval,
    approve,
    deny,
    watchForApprovals,
  }
})
