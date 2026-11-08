import {useBaseModal} from "@/composables/useBaseModal"
import ApproveDeviceModal from "../ApproveDeviceModal.vue"

import type {PendingApprovalView} from "@daily/protocol"

type Options = {request: PendingApprovalView; onApprove: () => Promise<void>; onDeny: () => Promise<void>}

export function useApproveDeviceModal() {
  const {show, hide} = useBaseModal("sync-server-approve-device")

  function open(options: Options) {
    show(ApproveDeviceModal, {...options, onClose: hide})
  }

  return {open, close: hide}
}
