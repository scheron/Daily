import {onScopeDispose} from "vue"

const HOVER_DELAY_MS = 150

let activeController: AbortController | null = null

function waitForHover(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(resolve, HOVER_DELAY_MS)

    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeoutId)
        reject(signal.reason)
      },
      {once: true},
    )
  })
}

export function useHoverAbortController() {
  let controller: AbortController | null = null

  function start() {
    activeController?.abort()

    const nextController = new AbortController()
    controller = nextController
    activeController = nextController

    return nextController
  }

  function cancel() {
    controller?.abort()
  }

  function finish(finishedController: AbortController) {
    if (activeController === finishedController) activeController = null
    if (controller === finishedController) controller = null
  }

  onScopeDispose(cancel)

  return {
    start,
    cancel,
    finish,
    waitForHover,
  }
}
