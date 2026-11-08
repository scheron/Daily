// @vitest-environment happy-dom
import {defineComponent, h} from "vue"
import {afterEach, beforeEach, expect, it, vi} from "vitest"

import {useWhatsNewRelease} from "@/ui/overlays/WhatsNewBanner/composables/useWhatsNewRelease"
import {flushPromises, mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

import type {WhatsNewRelease, WhatsNewReleaseResult} from "@shared/types/update"

const RETRY_DELAY = 300_000

beforeEach(() => {
  vi.useFakeTimers({toFake: ["Date", "setTimeout", "clearTimeout"]})
})

afterEach(() => {
  vi.useRealTimers()
})

it("publishes the release at the retry deadline and stops requesting it", async () => {
  const release: WhatsNewRelease = {
    version: "1.2.0",
    highlights: ["Shows the release notes after updating."],
    media: [],
    releaseUrl: "https://github.com/scheron/Daily/releases/tag/v1.2.0",
  }
  const getRelease = vi
    .fn<() => Promise<WhatsNewReleaseResult>>()
    .mockResolvedValueOnce({retryAt: Date.now() + RETRY_DELAY})
    .mockResolvedValue(release)
  const host = mountRelease(getRelease)

  try {
    await flushPromises()
    await vi.advanceTimersByTimeAsync(RETRY_DELAY - 1)
    expect(host.vm.release).toBeNull()
    expect(getRelease).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(host.vm.release).toEqual(release)

    await vi.advanceTimersByTimeAsync(RETRY_DELAY)
    expect(getRelease).toHaveBeenCalledTimes(2)
  } finally {
    host.unmount()
  }
})

it("stops requesting after a retry returns no release", async () => {
  const getRelease = vi
    .fn<() => Promise<WhatsNewReleaseResult>>()
    .mockResolvedValueOnce({retryAt: Date.now() + RETRY_DELAY})
    .mockResolvedValue(null)
  const host = mountRelease(getRelease)

  try {
    await flushPromises()
    await vi.advanceTimersByTimeAsync(RETRY_DELAY * 2)
    expect(host.vm.release).toBeNull()
    expect(getRelease).toHaveBeenCalledTimes(2)
  } finally {
    host.unmount()
  }
})

it.each(["a scheduled retry", "an in-flight request"] as const)("stops retries on unmount with %s", async (scenario) => {
  const retry = {retryAt: Date.now() + RETRY_DELAY}
  const response = Promise.withResolvers<WhatsNewReleaseResult>()
  const getRelease = vi
    .fn<() => Promise<WhatsNewReleaseResult>>()
    .mockReturnValueOnce(scenario === "a scheduled retry" ? Promise.resolve(retry) : response.promise)
    .mockResolvedValue(null)
  const host = mountRelease(getRelease)

  await flushPromises()
  host.unmount()
  response.resolve(retry)
  await flushPromises()
  await vi.advanceTimersByTimeAsync(RETRY_DELAY)
  expect(getRelease).toHaveBeenCalledTimes(1)
})

function mountRelease(getRelease: () => Promise<WhatsNewReleaseResult>) {
  mockBridgeIPC({"whats-new:get-release": getRelease})
  return mount(
    defineComponent({
      setup() {
        return {release: useWhatsNewRelease()}
      },
      render() {
        return h("div")
      },
    }),
  )
}
