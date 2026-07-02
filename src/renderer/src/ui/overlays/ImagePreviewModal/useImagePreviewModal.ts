import {useBaseModal} from "@/ui/base/BaseModal"

import ImagePreviewModal from "./ImagePreviewModal.vue"

const IMAGE_PREVIEW_MODAL_ID = "image-preview"

export function useImagePreviewModal() {
  const {show, hide, isOpen} = useBaseModal(IMAGE_PREVIEW_MODAL_ID)

  function open(src: string | null, alt?: string) {
    show(ImagePreviewModal, {src, alt, onClose: () => hide()})
  }

  function close() {
    hide()
  }

  return {isOpen, open, close}
}
