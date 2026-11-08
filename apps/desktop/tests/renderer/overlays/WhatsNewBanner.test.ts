// @vitest-environment happy-dom
import {nextTick} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, expect, it, vi} from "vitest"

import {useUiStore} from "@/stores/ui"
import WhatsNewBanner from "@/ui/overlays/WhatsNewBanner"
import {flushPromises, mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

import type {AppUpdateState, WhatsNewMedia, WhatsNewReleaseResult} from "@shared/types/update"

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it("waits for visibility before recording the recovered card once", async () => {
  const retryDelay = 1_000
  const {banner, recordShown, setWindowVisibility} = mountBanner(false, [], retryDelay)

  try {
    await flushPromises()
    await vi.advanceTimersByTimeAsync(retryDelay)
    expect(banner.find("h2").exists()).toBe(false)
    expect(recordShown).not.toHaveBeenCalled()

    setWindowVisibility(true)
    await nextTick()
    expect(banner.text()).toContain("1.2.0")
    vi.advanceTimersToNextFrame()
    vi.advanceTimersToNextFrame()
    await flushPromises()
    expect(recordShown).toHaveBeenCalledExactlyOnceWith("1.2.0")
  } finally {
    banner.unmount()
  }
})

it("waits for a visible main window and an unobstructed paint before recording the card as shown", async () => {
  const {banner, recordShown, setWindowVisibility} = mountBanner(false)
  const ui = useUiStore()

  try {
    await flushPromises()
    expect(banner.find("h2").exists()).toBe(false)
    expect(recordShown).not.toHaveBeenCalled()

    setWindowVisibility(true)
    await nextTick()
    expect(banner.text()).toContain("1.2.0")
    vi.advanceTimersToNextFrame()

    ui.toggleFocusDock(true)
    await nextTick()
    vi.advanceTimersToNextFrame()
    expect(banner.find("h2").exists()).toBe(false)
    expect(recordShown).not.toHaveBeenCalled()

    ui.toggleFocusDock(false)
    await nextTick()
    vi.advanceTimersToNextFrame()
    expect(recordShown).not.toHaveBeenCalled()
    vi.advanceTimersToNextFrame()
    await flushPromises()
    expect(recordShown).toHaveBeenCalledExactlyOnceWith("1.2.0")
    expect(banner.text()).toContain("1.2.0")
  } finally {
    banner.unmount()
  }
})

it("does not reintroduce a recorded release after reopening the same window", async () => {
  const {banner, recordShown, setWindowVisibility} = mountBanner(true)

  try {
    await flushPromises()
    vi.advanceTimersToNextFrame()
    vi.advanceTimersToNextFrame()
    await flushPromises()
    expect(banner.find("h2").exists()).toBe(true)
    expect(recordShown).toHaveBeenCalledExactlyOnceWith("1.2.0")

    setWindowVisibility(false)
    await nextTick()
    setWindowVisibility(true)
    await nextTick()
    expect(banner.find("h2").exists()).toBe(false)
  } finally {
    banner.unmount()
  }
})

it("keeps reduced-motion images static until the user starts them", async () => {
  const attachment = makeMedia({kind: "image", url: "https://github.com/user-attachments/assets/attachment-id"})
  vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    const list = new EventTarget() as MediaQueryList
    return Object.assign(list, {media: query, matches: query === "(prefers-reduced-motion: reduce)"})
  })
  const {banner} = mountBanner(true, [attachment])

  try {
    await flushPromises()
    expect(banner.find("img").exists()).toBe(false)
    expect(banner.get("canvas").attributes("aria-label")).toBe("Picker preview")

    await banner.get('button[aria-label="Play preview"]').trigger("click")
    expect(banner.get("img").attributes("src")).toBe(attachment.url)

    await banner.get('button[aria-label="Pause preview"]').trigger("click")
    expect(banner.find("img").exists()).toBe(false)
  } finally {
    banner.unmount()
  }
})

it("keeps one preview mounted, pauses video when switching and allows navigation after a media error", async () => {
  const gif = makeMedia()
  const video = makeMedia({
    kind: "video",
    url: "https://github.com/user-attachments/assets/picker.mp4",
    poster: "https://github.com/user-attachments/assets/poster.png",
    label: "Picker video",
  })
  const {banner} = mountBanner(true, [gif, video])

  try {
    await flushPromises()
    expect(banner.get("img").attributes("alt")).toBe(gif.label)
    expect(banner.find("video").exists()).toBe(false)

    await banner.get('button[aria-label="Next preview"]').trigger("click")
    expect(banner.find("img").exists()).toBe(false)
    const player = banner.get("video")
    const pause = vi.spyOn(player.element, "pause")
    expect(player.attributes("poster")).toBe(video.poster)
    expect(player.element.muted).toBe(true)
    expect(player.element.autoplay).toBe(true)
    expect(player.element.loop).toBe(true)
    expect(player.element.controls).toBe(false)
    expect(banner.find('button[aria-label="Play preview"]').exists()).toBe(false)
    expect(banner.find('button[aria-label="Pause preview"]').exists()).toBe(false)

    await banner.get('button[aria-label="Previous preview"]').trigger("click")
    expect(pause).toHaveBeenCalled()
    expect(banner.get("img").attributes("src")).toBe(gif.url)

    await banner.get('button[aria-label="Next preview"]').trigger("click")
    await banner.get("video").trigger("error")
    expect(banner.text()).toContain("Preview unavailable")
    await banner.get('button[aria-label="Previous preview"]').trigger("click")
    expect(banner.text()).not.toContain("Preview unavailable")
  } finally {
    banner.unmount()
  }
})

function mountBanner(initiallyVisible: boolean, media: WhatsNewMedia[] = [], retryDelay: number | null = null) {
  vi.useFakeTimers({toFake: ["Date", "setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"]})
  setActivePinia(createPinia())
  let onWindowVisibility: ((visible: boolean) => void) | null = null
  const state: AppUpdateState = {
    status: "idle",
    currentVersion: "1.2.0",
    availableVersion: null,
    availableHash: null,
    source: null,
    downloadProgress: null,
    downloadedAt: null,
    checkedAt: null,
    reason: null,
    installFailure: null,
  }
  const recordShown = vi.fn().mockResolvedValue(true)
  const getRelease = vi.fn<() => Promise<WhatsNewReleaseResult>>().mockResolvedValue({
    version: "1.2.0",
    highlights: ["Shows the release notes after updating."],
    media,
    releaseUrl: "https://github.com/scheron/Daily/releases/tag/v1.2.0",
  })
  if (retryDelay !== null) getRelease.mockResolvedValueOnce({retryAt: Date.now() + retryDelay})
  mockBridgeIPC({
    "window:is-visible": vi.fn().mockResolvedValue(initiallyVisible),
    "window:on-visibility-changed": (callback) => {
      onWindowVisibility = callback
      return () => {}
    },
    "updates:get-state": vi.fn().mockResolvedValue(state),
    "whats-new:get-release": getRelease,
    "whats-new:mark-shown": recordShown,
  })
  const banner = mount(WhatsNewBanner, {global: {directives: {tooltip: {}}, stubs: {Teleport: true}}})

  return {
    banner,
    recordShown,
    setWindowVisibility(visible: boolean) {
      onWindowVisibility?.(visible)
    },
  }
}

function makeMedia(overrides: Partial<WhatsNewMedia> = {}): WhatsNewMedia {
  return {kind: "gif", url: "https://github.com/user-attachments/assets/picker.gif", label: "Picker preview", ...overrides}
}
