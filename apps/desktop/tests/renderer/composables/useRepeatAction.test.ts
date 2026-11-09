import {effectScope} from "vue"
import {expect, it, vi} from "vitest"

import {useRepeatAction} from "@/ui/common/(pickers)/EstimationPicker/{fragments}/TimePicker/composables/useRepeatAction"

it.each([
  [100, 1],
  [350, 2],
])("stops a held time control when it closes after %d ms", (heldFor, expectedCalls) => {
  vi.useFakeTimers()
  const scope = effectScope()
  const action = vi.fn()

  try {
    scope.run(() => useRepeatAction(action).start())
    vi.advanceTimersByTime(heldFor)
    expect(action).toHaveBeenCalledTimes(expectedCalls)

    scope.stop()
    vi.advanceTimersByTime(500)
    expect(action).toHaveBeenCalledTimes(expectedCalls)
  } finally {
    scope.stop()
    vi.useRealTimers()
  }
})
