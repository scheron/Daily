import {mkdtemp, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {WhatsNewController} from "@main/modules/updates/WhatsNewController"

import type {WhatsNewRelease} from "@shared/types/update"

const {fetchWhatsNewRelease} = vi.hoisted(() => ({fetchWhatsNewRelease: vi.fn()}))

vi.mock(import("@main/modules/updates/whatsNewRelease"), async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWhatsNewRelease,
}))

describe("What's New after updating Daily", () => {
  let profile: string
  let statePath: string

  beforeEach(async () => {
    profile = await mkdtemp(join(tmpdir(), "daily-whats-new-"))
    statePath = join(profile, "whats-new.json")
    fetchWhatsNewRelease.mockReset().mockImplementation(async (version: string) => makeRelease(version))
  })

  afterEach(async () => {
    vi.useRealTimers()
    await rm(profile, {recursive: true, force: true})
  })

  it("establishes a baseline on a clean or damaged profile and shows only a subsequent upgrade", async () => {
    expect(await launch("1.0.0").getRelease()).toBeNull()
    expect(await launch("1.0.0").getRelease()).toBeNull()

    await writeFile(statePath, '{"lastVersion":"1.0.0","shownVersions":42}')
    expect(await launch("1.1.0").getRelease()).toBeNull()
    expect(await launch("1.2.0").getRelease()).toEqual(makeRelease("1.2.0"))
  })

  it("keeps the exact pending release until shown and remembers its display across restarts and rollbacks", async () => {
    launch("1.0.0")
    const upgraded = launch("1.3.0")
    expect(upgraded.markShown("1.3.0")).toBe(false)
    expect(await upgraded.getRelease()).toEqual(makeRelease("1.3.0"))

    fetchWhatsNewRelease.mockResolvedValueOnce(null)
    const restarted = launch("1.3.0")
    expect(await restarted.getRelease()).toEqual(makeRelease("1.3.0"))
    expect(restarted.markShown("1.4.0")).toBe(false)
    expect(restarted.markShown("1.3.0")).toBe(true)
    expect(await restarted.getRelease()).toBeNull()
    expect(await launch("1.3.0").getRelease()).toBeNull()
    expect(await launch("1.2.0").getRelease()).toBeNull()
    expect(await launch("1.3.0").getRelease()).toBeNull()

    fetchWhatsNewRelease.mockReset().mockResolvedValue(makeRelease("1.4.0"))
    expect(await launch("1.4.0").getRelease()).toEqual(makeRelease("1.4.0"))
  })

  it("shares each lookup and retries pending notes when the reported deadline arrives", async () => {
    vi.useFakeTimers({toFake: ["Date"], now: new Date("2026-11-08T00:00:00Z")})
    const retryAt = Date.parse("2026-11-08T00:05:00Z")
    launch("1.0.0")
    fetchWhatsNewRelease.mockResolvedValueOnce({retryAt})
    const upgraded = launch("1.1.0")

    expect(await Promise.all([upgraded.getRelease(), upgraded.getRelease()])).toEqual([{retryAt}, {retryAt}])
    vi.setSystemTime(retryAt - 1)
    expect(await upgraded.getRelease()).toEqual({retryAt})
    expect(fetchWhatsNewRelease).toHaveBeenCalledTimes(1)

    vi.setSystemTime(retryAt)
    const release = makeRelease("1.1.0")
    expect(await Promise.all([upgraded.getRelease(), upgraded.getRelease()])).toEqual([release, release])
    expect(await upgraded.getRelease()).toEqual(release)
    expect(fetchWhatsNewRelease).toHaveBeenCalledTimes(2)
  })

  it("replaces unshown notes on upgrade and clears pending notes on downgrade", async () => {
    launch("1.0.0")
    expect(await launch("1.1.0").getRelease()).toEqual(makeRelease("1.1.0"))
    expect(await launch("1.3.0").getRelease()).toEqual(makeRelease("1.3.0"))
    expect(await launch("1.2.0").getRelease()).toBeNull()
    expect(await launch("1.2.0").getRelease()).toBeNull()
  })

  it("leaves an unexpected release pending for a later launch", async () => {
    launch("1.0.0")
    fetchWhatsNewRelease.mockResolvedValueOnce(makeRelease("1.2.0"))
    const upgraded = launch("1.1.0")
    expect(await upgraded.getRelease()).toBeNull()
    expect(await upgraded.getRelease()).toBeNull()
    expect(upgraded.markShown("1.1.0")).toBe(false)
    expect(await launch("1.1.0").getRelease()).toEqual(makeRelease("1.1.0"))
  })

  function launch(version: string) {
    return new WhatsNewController(version, statePath)
  }
})

function makeRelease(version: string): WhatsNewRelease {
  return {
    version,
    highlights: [`Highlights for ${version}`],
    media: [{kind: "gif", label: "Demo", url: `https://github.com/scheron/Daily/releases/download/v${version}/demo.gif`}],
    releaseUrl: `https://github.com/scheron/Daily/releases/tag/v${version}`,
  }
}
