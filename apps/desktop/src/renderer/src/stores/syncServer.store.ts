import {ref} from "vue"
import {toasts} from "vue-toasts-lite"
import {invoke} from "@vueuse/core"
import {defineStore} from "pinia"

import {useBaseModal} from "@/ui/base/BaseModal"
import ApproveAgentModal from "@/ui/overlays/ApproveAgentModal.vue"
import ApproveDeviceModal from "@/ui/overlays/ApproveDeviceModal.vue"

import type {
  AgentWindowView,
  EnrollmentPollView,
  EnrollmentTicketView,
  EnrollmentWindowView,
  PendingAgentRequestView,
  PendingApprovalView,
  ProtocolMismatchView,
  ServerAgentsView,
  ServerAgentView,
  ServerBindingView,
  ServerMembershipView,
  ServerProbeView,
} from "@daily/protocol"

export const useSyncServerStore = defineStore("syncServer", () => {
  const binding = ref<ServerBindingView | null>(null)
  const isRevoked = ref(false)
  const mismatch = ref<ProtocolMismatchView | null>(null)
  const isReachable = ref(true)
  const membership = ref<ServerMembershipView | null>(null)
  const agents = ref<ServerAgentView[]>([])
  const agentWindow = ref<AgentWindowView | null>(null)
  let isWatchingApprovals = false

  const {show: showApproval, hide: hideApproval} = useBaseModal("sync-server-approve-device")
  const {show: showAgentApproval, hide: hideAgentApproval} = useBaseModal("sync-server-approve-agent")

  window.BridgeIPC["sync-server:on-revoked"](() => {
    isRevoked.value = true
  })

  window.BridgeIPC["sync-server:on-protocol-mismatch-changed"]((nextMismatch) => {
    mismatch.value = nextMismatch
  })

  window.BridgeIPC["sync-server:on-role-changed"]((role) => {
    if (binding.value) binding.value.role = role
    listMembership()
    listAgents()
  })

  window.BridgeIPC["sync-server:on-agents-accepted-changed"]((acceptsAgents) => {
    if (binding.value) binding.value.acceptsAgents = acceptsAgents
  })

  window.BridgeIPC["sync-server:on-reachability-changed"]((nextIsReachable) => {
    isReachable.value = nextIsReachable
  })

  async function loadState(): Promise<void> {
    try {
      const state = await window.BridgeIPC["sync-server:get-state"]()
      binding.value = state.binding
      isRevoked.value = state.revoked
      mismatch.value = state.mismatch
      isReachable.value = state.isReachable
      if (binding.value?.role === "parent") await listMembership()
      if (state.binding && !state.revoked && !state.mismatch) await listAgents()
      else applyAgents(null)
    } catch (error) {
      console.error("Failed to load the Daily Sync Server state:", error)
    }
  }

  async function retry(): Promise<void> {
    await window.BridgeIPC["sync-server:retry"]()
  }

  async function listMembership(): Promise<void> {
    try {
      applyMembership(await window.BridgeIPC["sync-server:list-membership"]())
    } catch (error) {
      console.error("Failed to load the Daily Sync Server's membership:", error)
    }
  }

  async function listAgents(): Promise<void> {
    try {
      applyAgents(await window.BridgeIPC["sync-server:list-agents"]())
    } catch (error) {
      console.error("Failed to load the Daily Sync Server's agents:", error)
    }
  }

  async function revokeAgent(agentId: string): Promise<ServerAgentsView> {
    const result = await window.BridgeIPC["sync-server:revoke-agent"](agentId)
    applyAgents(result)
    return result
  }

  async function revokeDevice(deviceId: string): Promise<ServerMembershipView> {
    const result = await window.BridgeIPC["sync-server:revoke-device"](deviceId)
    applyMembership(result)
    await listAgents()
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

  async function openAgentWindow(): Promise<AgentWindowView> {
    const result = await window.BridgeIPC["sync-server:open-agent-window"]()
    await listAgents()
    return result
  }

  async function closeAgentWindow(): Promise<void> {
    await window.BridgeIPC["sync-server:close-agent-window"]()
    await listAgents()
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

  function applyMembership(view: ServerMembershipView): void {
    membership.value = {...view, devices: view.devices.filter((device) => !device.revokedAt)}
  }

  function applyAgents(view: ServerAgentsView | null): void {
    agents.value = view?.agents.filter((agent) => !agent.revokedAt) ?? []
    agentWindow.value = view?.agentWindow ?? null
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
          toasts.error("Failed to approve device")
        }
        hideApproval()
      },
      onDeny: async () => {
        try {
          await deny(pending.requestId)
        } catch (error) {
          console.error("Failed to deny the device:", error)
          toasts.error("Failed to decline device")
        }
        hideApproval()
      },
      onClose: () => hideApproval(),
    })
  }

  async function getPendingAgentRequest(): Promise<PendingAgentRequestView | null> {
    return window.BridgeIPC["sync-server:get-pending-agent-request"]()
  }

  async function approveAgent(requestId: string, code: string): Promise<void> {
    await window.BridgeIPC["sync-server:approve-agent"](requestId, code)
    await listAgents()
  }

  async function denyAgent(requestId: string): Promise<void> {
    await window.BridgeIPC["sync-server:deny-agent"](requestId)
  }

  async function openAgentApprovalDialog(): Promise<void> {
    const pending = await getPendingAgentRequest()
    if (!pending) return

    if (!binding.value) {
      await loadState()
      if (!binding.value) return
    }

    showAgentApproval(ApproveAgentModal, {
      request: pending,
      deviceName: binding.value.deviceName,
      onApprove: async () => {
        try {
          await approveAgent(pending.requestId, pending.code)
        } catch (error) {
          console.error("Failed to approve the agent:", error)
          toasts.error("Failed to approve agent")
        }
        hideAgentApproval()
      },
      onDeny: async () => {
        try {
          await denyAgent(pending.requestId)
        } catch (error) {
          console.error("Failed to decline the agent:", error)
          toasts.error("Failed to decline agent")
        }
        hideAgentApproval()
      },
      onClose: () => hideAgentApproval(),
    })
  }

  /**
   * The subscription is set up only once; a request that arrived before anything was listening
   * is still opened. The main process sends a request to a single window and tells every window
   * once it is resolved, so no other window is left holding a card that can no longer be acted on.
   * It watches for both device and agent requests.
   */
  function watchForApprovals(): void {
    if (isWatchingApprovals) return
    isWatchingApprovals = true

    window.BridgeIPC["sync-server:on-approval-requested"](() => {
      openApprovalDialog()
    })
    openApprovalDialog()

    window.BridgeIPC["sync-server:on-agent-requested"](() => {
      openAgentApprovalDialog()
    })
    openAgentApprovalDialog()

    window.BridgeIPC["sync-server:on-approval-resolved"]((kind) => {
      if (kind === "device") hideApproval()
      else hideAgentApproval()
    })
  }

  invoke(loadState)

  return {
    binding,
    isRevoked,
    mismatch,
    isReachable,
    membership,
    agents,
    agentWindow,

    loadState,
    retry,
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
    listAgents,
    revokeAgent,
    openAgentWindow,
    closeAgentWindow,
    watchForApprovals,
  }
})
