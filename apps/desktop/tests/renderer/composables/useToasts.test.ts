import {toasts as localToasts} from "vue-toasts-lite"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {toasts, useToasts} from "@/composables/useToasts"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

vi.mock("vue-toasts-lite", () => ({toasts: {error: vi.fn(), info: vi.fn(), success: vi.fn()}}))

describe("useToasts", () => {
  beforeEach(() => vi.clearAllMocks())

  it("publishes to the main window by default", () => {
    const bridge = mockBridgeIPC()

    toasts.success("Saved")

    expect(bridge["toast:publish"]).toHaveBeenCalledExactlyOnceWith({type: "success", message: "Saved"})
    expect(localToasts.success).not.toHaveBeenCalled()
  })

  it("shows an explicitly local toast in the calling window", () => {
    const bridge = mockBridgeIPC()

    useToasts("current").error("Could not save")

    expect(localToasts.error).toHaveBeenCalledExactlyOnceWith("Could not save")
    expect(bridge["toast:publish"]).not.toHaveBeenCalled()
  })
})
