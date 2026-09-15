import {useBaseModal} from "@/ui/base/BaseModal"
import SearchModal from "../SearchModal.vue"

export function useSearchModal() {
  const {show, hide, isOpen} = useBaseModal("search")

  function toggle() {
    if (isOpen.value) hide()
    else show(SearchModal, {onClose: hide})
  }

  return {toggle}
}
