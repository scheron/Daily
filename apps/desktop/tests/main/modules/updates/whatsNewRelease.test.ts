import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import type {fetchWhatsNewRelease as loadRelease} from "../../../../src/main/modules/updates/whatsNewRelease"

const version = "0.38.3"
const tag = `v${version}`
const releaseUrl = `https://github.com/scheron/Daily/releases/tag/${tag}`
const apiUrl = `https://api.github.com/repos/scheron/Daily/releases/tags/${tag}`
const downloadUrl = `https://github.com/scheron/Daily/releases/download/${tag}`
const gifUrl = `${downloadUrl}/daily-0.38.3-project-emoji.gif`

function releaseResponse(body: string, assets: Array<{name: string; browser_download_url: string; content_type: string}> = []) {
  return Response.json({tag_name: tag, draft: false, prerelease: false, body, assets})
}

describe("loading What's New for the installed release", () => {
  let fetchWhatsNewRelease: typeof loadRelease

  beforeEach(async () => {
    vi.resetModules()
    const release = await import("../../../../src/main/modules/updates/whatsNewRelease")
    fetchWhatsNewRelease = release.fetchWhatsNewRelease
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("loads the exact release and shows its linked GIF once even when it is also an asset", async () => {
    const body = `### 🎨 Improvements\n\n- **Projects** — choose an emoji icon from a searchable picker when creating or editing a project.\n\n![Choose an emoji for your project](${gifUrl})\n\n---`
    const fetch = vi.fn().mockResolvedValue(
      releaseResponse(body, [
        {name: "Daily-0.38.3-mac.dmg", browser_download_url: `${downloadUrl}/Daily-0.38.3-mac.dmg`, content_type: "application/x-apple-diskimage"},
        {name: "daily-0.38.3-project-emoji.gif", browser_download_url: gifUrl, content_type: "image/gif"},
      ]),
    )
    vi.stubGlobal("fetch", fetch)

    await expect(fetchWhatsNewRelease(version)).resolves.toEqual({
      version,
      releaseUrl,
      highlights: ["Projects — choose an emoji icon from a searchable picker when creating or editing a project."],
      media: [{kind: "gif", url: gifUrl, label: "Choose an emoji for your project"}],
    })
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([apiUrl])
  })

  it("normalizes safe media from videos, direct links and release assets while preserving plain text", async () => {
    const videoUrl = `${downloadUrl}/picker.mp4`
    const webmUrl = `${downloadUrl}/preview.webm`
    const posterUrl = `${downloadUrl}/picker.png`
    const body = [
      "- **Changes** use `Daily` &amp; release notes.",
      "- Keyboard shortcuts are easier to find.",
      "- A third change.",
      "- The full list stays on GitHub.",
      "",
      `<img src="${gifUrl}" alt="Animated picker" onerror="alert('ignored')">`,
      `<video poster="${posterUrl}" aria-label="Picker demo" onclick="alert('ignored')">`,
      `<source src="${videoUrl}" type="video/mp4">`,
      "</video>",
      "",
      `[WebM demo](${webmUrl})`,
      "",
      "![Untrusted](https://github.com.example.com/unsafe.gif)",
      `![Insecure](${gifUrl.replace("https:", "http:")})`,
      "<script>alert('ignored')</script>",
    ].join("\n")
    const screenshotUrl = `${downloadUrl}/keyboard.png`
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        releaseResponse(body, [
          {name: "keyboard.png", browser_download_url: screenshotUrl, content_type: "image/png"},
          {name: "untrusted.mp4", browser_download_url: "https://github.com/example/elsewhere/unsafe.mp4", content_type: "video/mp4"},
        ]),
      ),
    )

    await expect(fetchWhatsNewRelease(version)).resolves.toEqual({
      version,
      releaseUrl,
      highlights: ["Changes use Daily & release notes.", "Keyboard shortcuts are easier to find.", "A third change."],
      media: [
        {kind: "gif", url: gifUrl, label: "Animated picker"},
        {kind: "video", url: videoUrl, label: "Picker demo", poster: posterUrl},
        {kind: "video", url: webmUrl, label: "WebM demo"},
        {kind: "image", url: screenshotUrl, label: "keyboard.png"},
      ],
    })
  })

  it("keeps the text of a link to blocked media as a highlight", async () => {
    const body = "- [Export walkthrough](https://example.com/preview.mp4)"
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(releaseResponse(body)))

    await expect(fetchWhatsNewRelease(version)).resolves.toMatchObject({highlights: ["Export walkthrough"], media: []})
  })

  it.each([
    () => Response.json({tag_name: "v0.39.0", draft: false, body: "- A different release."}),
    () => new Response("{"),
    () => releaseResponse(`### 🎨 Improvements\n\n![Preview](${gifUrl})`),
    () => new Response(null, {status: 404}),
  ])("leaves unavailable, mismatched and unusable release notes pending without retrying", async (response) => {
    const fetch = vi.fn().mockImplementation(async () => response())
    vi.stubGlobal("fetch", fetch)

    await expect(fetchWhatsNewRelease(version)).resolves.toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("returns a five-minute deadline when the immediate retry also fails", async () => {
    vi.useFakeTimers({now: new Date("2026-11-07T00:00:00Z")})
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Network error"))
      .mockImplementation(async () => new Response(null, {status: 503}))
    vi.stubGlobal("fetch", fetch)

    const load = fetchWhatsNewRelease(version)
    await vi.runAllTimersAsync()

    await expect(load).resolves.toEqual({retryAt: Date.parse("2026-11-07T00:05:00.400Z")})
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("retries when GitHub sends successful headers but the response body fails in transit", async () => {
    vi.useFakeTimers()
    const body = new ReadableStream({
      start(controller) {
        controller.error(new TypeError("Network error"))
      },
    })
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(body))
      .mockImplementation(async () => releaseResponse("A new feature is available."))
    vi.stubGlobal("fetch", fetch)

    const load = fetchWhatsNewRelease(version)
    await vi.runAllTimersAsync()

    await expect(load).resolves.toMatchObject({highlights: ["A new feature is available."]})
  })

  it("does not request GitHub again until its cooldown elapses", async () => {
    const startedAt = Date.parse("2026-11-07T00:00:00Z")
    vi.useFakeTimers({now: startedAt})
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, {status: 429, headers: {"Retry-After": "120"}}))
      .mockImplementation(async () => releaseResponse("A new feature is available."))
    vi.stubGlobal("fetch", fetch)

    const retryAt = startedAt + 120_000
    await expect(fetchWhatsNewRelease(version)).resolves.toEqual({retryAt})
    vi.setSystemTime(startedAt + 119_000)
    await expect(fetchWhatsNewRelease(version)).resolves.toEqual({retryAt})
    expect(fetch).toHaveBeenCalledTimes(1)

    vi.setSystemTime(startedAt + 120_000)
    await expect(fetchWhatsNewRelease(version)).resolves.toMatchObject({highlights: ["A new feature is available."]})
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
