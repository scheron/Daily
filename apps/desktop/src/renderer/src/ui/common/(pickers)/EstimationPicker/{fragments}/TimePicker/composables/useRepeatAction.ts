import {onScopeDispose} from "vue"

export function useRepeatAction(action: () => void) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let intervalId: ReturnType<typeof setInterval> | null = null

  function start() {
    stop()
    action()

    timeoutId = setTimeout(() => {
      intervalId = setInterval(() => action(), 30)
    }, 300)
  }

  function stop() {
    if (timeoutId !== null) clearTimeout(timeoutId)
    if (intervalId !== null) clearInterval(intervalId)
    timeoutId = null
    intervalId = null
  }

  onScopeDispose(stop)

  return {start, stop}
}
