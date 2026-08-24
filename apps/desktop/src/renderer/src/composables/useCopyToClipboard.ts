import {autoResetRef, useClipboard} from "@vueuse/core"

type Params = {
  onSuccess?: () => void
  onError?: () => void
}

/**
 * Copy text to the clipboard with a self-resetting `isCopied` flag — bind it to
 * a button to swap to a "copied" icon for ~1.5s, then revert to the normal one.
 *
 * @example
 * const {copyToClipboard, isCopied} = useCopyToClipboard({onSuccess: () => toasts.success("Copied")})
 * // <BaseButton :icon="isCopied ? 'check' : 'copy'" @click="copyToClipboard(task.id)" />
 */
export function useCopyToClipboard(params: Params = {}) {
  const isCopied = autoResetRef(false, 1500)
  const {copy} = useClipboard({legacy: true})

  async function copyToClipboard(text: string | number): Promise<void> {
    try {
      await copy(String(text))
      isCopied.value = true
      params.onSuccess?.()
    } catch {
      params.onError?.()
    }
  }

  return {copyToClipboard, isCopied}
}
