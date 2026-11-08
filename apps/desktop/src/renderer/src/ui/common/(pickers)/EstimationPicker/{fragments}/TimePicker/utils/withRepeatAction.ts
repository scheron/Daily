export function withRepeatAction(action: () => void) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let intervalId: ReturnType<typeof setInterval> | null = null

  function start() {
    action()

    timeoutId = setTimeout(() => {
      intervalId = setInterval(() => action(), 30)
    }, 300)
  }

  function stop() {
    if (timeoutId) clearTimeout(timeoutId)
    if (intervalId) clearInterval(intervalId)
    timeoutId = null
    intervalId = null
  }

  return {start, stop}
}
