export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function withRepeatAction<T extends (...args: any[]) => any>(action: T, {initialDelay = 300, interval = 30} = {}) {
  if (typeof action !== "function") {
    throw new Error("Invalid argument: `action` must be a function.")
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let intervalId: ReturnType<typeof setInterval> | null = null

  function start(...args: any[]) {
    action(...args)

    timeoutId = setTimeout(() => {
      intervalId = setInterval(() => action(...args), interval)
    }, initialDelay)
  }

  function stop() {
    if (timeoutId) clearTimeout(timeoutId)
    if (intervalId) clearInterval(intervalId)
    timeoutId = null
    intervalId = null
  }

  return {start, stop}
}
