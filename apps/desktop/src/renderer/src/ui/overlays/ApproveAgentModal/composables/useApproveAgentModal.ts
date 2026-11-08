import {useBaseModal} from "@/composables/useBaseModal"
import ApproveAgentModal from "../ApproveAgentModal.vue"

import type {PendingAgentRequestView} from "@daily/protocol"

type Options = {request: PendingAgentRequestView; deviceName: string; onApprove: () => Promise<void>; onDeny: () => Promise<void>}

export function useApproveAgentModal() {
  const {show, hide} = useBaseModal("sync-server-approve-agent")

  function open(options: Options) {
    show(ApproveAgentModal, {...options, onClose: hide})
  }

  return {open, close: hide}
}
