import {autoResetRef, useClipboard} from "@vueuse/core"

type CopyToClipboardOptions = {onSuccess?: () => void}

export function useCopyToClipboard({onSuccess}: CopyToClipboardOptions = {}) {
  const isCopied = autoResetRef(false, 1500)
  const {copy} = useClipboard({legacy: true})

  async function copyToClipboard(text: string | number): Promise<void> {
    try {
      await copy(String(text))
      isCopied.value = true
      onSuccess?.()
    } catch {}
  }

  return {copyToClipboard, isCopied}
}
