import {EventEmitter} from "node:events"
import {mkdir, mkdtemp, readFile, rm, symlink, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import path from "node:path"
import {app, powerMonitor} from "electron"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import * as updateCheckSchedule from "../../../../src/main/modules/updates/utils/updateCheckSchedule"
import {UpdaterController} from "../../../../src/main/modules/updates/UpdaterController"

import type {IStorageController} from "@daily/core"
import type {BrowserWindow} from "electron"

let userData: string
let packaged = false
const {spawn} = vi.hoisted(() => ({spawn: vi.fn(() => ({unref: vi.fn()}))}))

vi.mock("node:child_process", () => ({spawn, default: {spawn}}))
vi.mock("../../../../src/main/modules/updates/utils/createInstallerScript", () => ({
  createInstallerScript: vi.fn().mockResolvedValue("/dev/null"),
}))

vi.mock("electron", () => ({
  app: Object.defineProperties(new EventEmitter(), {
    getVersion: {value: () => "1.0.0"},
    getPath: {value: () => userData},
    quit: {value: vi.fn()},
    isPackaged: {get: () => packaged},
  }),
  powerMonitor: new EventEmitter(),
}))

const manifestUrl = "https://github.com/scheron/Daily/releases/latest/download/latest.json"
const releaseUrl = "https://api.github.com/repos/scheron/Daily/releases/tags/v1.1.0"
const assetName = "Daily-1.1.0-mac.dmg"
const assetUrl = `https://github.com/scheron/Daily/releases/download/v1.1.0/${assetName}`
const hash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
const manifest = {version: "1.1.0", tag: "v1.1.0", sha256: hash}
const asset = {id: 123, name: assetName, browser_download_url: assetUrl, digest: `sha256:${hash}`}
const release = {
  tag_name: manifest.tag,
  draft: false,
  prerelease: false,
  assets: [asset],
}

function makeManifest(overrides: Partial<typeof manifest>) {
  return {...manifest, ...overrides}
}

function makeAsset(overrides: Partial<typeof asset>) {
  return {...asset, ...overrides}
}

function makeRelease(overrides: Partial<typeof release>) {
  return {...release, ...overrides}
}

describe("checking GitHub releases through the updater", () => {
  const originalPlatform = process.platform

  beforeEach(async () => {
    Object.defineProperty(process, "platform", {value: "darwin"})
    userData = await mkdtemp(path.join(tmpdir(), "daily-updates-"))
  })

  afterEach(async () => {
    Object.defineProperty(process, "platform", {value: originalPlatform})
    app.emit("will-quit")
    packaged = false
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    await rm(userData, {recursive: true, force: true})
  })

  it("keeps the periodic deadline across restart and polls once when resuming after it", async () => {
    packaged = true
    const startedAt = new Date("2026-11-04T00:00:00Z").getTime()
    vi.useFakeTimers({now: startedAt})
    vi.spyOn(Math, "random").mockReturnValue(0.5)
    const fetch = vi.fn().mockImplementation(() => Response.json(makeManifest({version: "1.0.0", tag: "v1.0.0"})))
    vi.stubGlobal("fetch", fetch)

    await new UpdaterController().initialize()
    app.emit("will-quit")
    vi.setSystemTime(startedAt + 59 * 60_000)
    const restarted = new UpdaterController()
    await restarted.initialize()
    powerMonitor.emit("resume")
    await Promise.resolve()
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([manifestUrl])

    vi.setSystemTime(startedAt + 3 * 60 * 60_000)
    powerMonitor.emit("resume")
    powerMonitor.emit("resume")
    await vi.waitFor(() => expect(Date.parse(restarted.getState().checkedAt ?? "")).toBeGreaterThanOrEqual(startedAt + 3 * 60 * 60_000))
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([manifestUrl, manifestUrl])
  })

  it("honors the later REST deadline after restart and confirms the same manifest on its scheduled retry", async () => {
    packaged = true
    const startedAt = new Date("2026-11-04T00:00:00Z").getTime()
    vi.useFakeTimers({now: startedAt})
    vi.spyOn(Math, "random").mockReturnValue(0.5)
    let restAttempts = 0
    const fetch = vi.fn().mockImplementation((url) => {
      if (url === manifestUrl) return Response.json(manifest)
      if (restAttempts++ > 0) return Response.json(release)
      return Response.json(
        {message: "API rate limit exceeded"},
        {status: 403, headers: {"Retry-After": "60", "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(startedAt / 1000 + 120)}},
      )
    })
    vi.stubGlobal("fetch", fetch)

    await new UpdaterController().initialize()
    app.emit("will-quit")
    vi.setSystemTime(startedAt + 90_000)
    const restarted = new UpdaterController()
    await restarted.initialize()
    expect(await restarted.checkForUpdate({manual: true})).toMatchObject({availableVersion: null})
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([manifestUrl, releaseUrl, manifestUrl])

    await vi.advanceTimersByTimeAsync(60_000)
    await vi.waitFor(() => expect(restarted.getState()).toMatchObject({status: "available", availableVersion: manifest.version}))
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([manifestUrl, releaseUrl, manifestUrl, manifestUrl, releaseUrl])
  })

  it("returns to the regular cadence when the manifest fails at the end of a REST pause", async () => {
    packaged = true
    vi.useFakeTimers()
    vi.spyOn(Math, "random").mockReturnValue(0)
    const fetch = vi.fn().mockImplementation(() => new Response(null, {status: 404}))
    fetch.mockResolvedValueOnce(Response.json(manifest)).mockResolvedValueOnce(new Response(null, {status: 429}))
    vi.stubGlobal("fetch", fetch)
    const controller = new UpdaterController()

    await controller.initialize()
    await vi.advanceTimersByTimeAsync(60_000)
    await vi.waitFor(() => expect(fetch.mock.calls.map(([url]) => url)).toEqual([manifestUrl, releaseUrl, manifestUrl]))
    await vi.advanceTimersByTimeAsync(5 * 60_000)

    expect(controller.getState()).toMatchObject({status: "error", availableVersion: null})
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([manifestUrl, releaseUrl, manifestUrl])
  })

  it("allows the next manual check after an unrelated forbidden response", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(manifest))
      .mockResolvedValueOnce(Response.json({message: "Resource not accessible"}, {status: 403}))
      .mockResolvedValueOnce(Response.json(manifest))
      .mockResolvedValueOnce(Response.json(release))
    vi.stubGlobal("fetch", fetch)
    const controller = new UpdaterController()

    expect(await controller.checkForUpdate()).toMatchObject({status: "error", availableVersion: null})
    expect(await controller.checkForUpdate()).toMatchObject({status: "available", availableVersion: manifest.version})
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([manifestUrl, releaseUrl, manifestUrl, releaseUrl])
  })

  it("restores an offer while pausing REST for a new tag after a successful response uses the last request", async () => {
    packaged = true
    const startedAt = new Date("2026-11-04T00:00:00Z").getTime()
    vi.useFakeTimers({now: startedAt})
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(manifest))
      .mockResolvedValueOnce(Response.json(release, {headers: {"X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(startedAt / 1000 + 120)}}))
      .mockResolvedValueOnce(Response.json(makeManifest({tag: "v1.2.0", version: "1.2.0"})))
    vi.stubGlobal("fetch", fetch)
    await new UpdaterController().initialize()
    app.emit("will-quit")

    const restarted = new UpdaterController()
    await restarted.initialize()
    expect(restarted.getState()).toMatchObject({status: "available", availableVersion: manifest.version})
    expect(await restarted.checkForUpdate()).toMatchObject({status: "available", availableVersion: manifest.version})
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([manifestUrl, releaseUrl, manifestUrl])
  })

  it("does not use REST or offer an update when the manifest is older than the running app", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(makeManifest({version: "0.9.0", tag: "v0.9.0"})))
    vi.stubGlobal("fetch", fetch)

    const state = await new UpdaterController().checkForUpdate()

    expect(state).toMatchObject({status: "idle", availableVersion: null})
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([manifestUrl])
  })

  it("offers only the asset whose exact tag, name, URL and digest match the manifest", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(manifest)).mockResolvedValueOnce(Response.json(release))
    vi.stubGlobal("fetch", fetch)

    const state = await new UpdaterController().checkForUpdate()

    expect(state).toMatchObject({status: "available", availableVersion: manifest.version, availableHash: hash})
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([manifestUrl, releaseUrl])
  })

  it.each([
    ["a mismatched tag", {tag_name: "v1.2.0"}],
    ["a draft release", {draft: true}],
    ["a prerelease", {prerelease: true}],
    ["the digest of a different DMG", {assets: [makeAsset({digest: `sha256:${"f".repeat(64)}`})]}],
    ["a different repository URL", {assets: [makeAsset({browser_download_url: assetUrl.replace("scheron/", "other/")})]}],
  ])("does not offer an update for %s", async (_label, mismatch) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(manifest))
      .mockResolvedValueOnce(Response.json(makeRelease(mismatch)))
    vi.stubGlobal("fetch", fetch)

    const state = await new UpdaterController().checkForUpdate()

    expect(state).toMatchObject({status: "error", availableVersion: null})
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([manifestUrl, releaseUrl])
  })

  it("installs the displayed update when clicked while its check is saving the next deadline", async () => {
    packaged = true
    const scheduleWriteStarted = Promise.withResolvers<void>()
    const finishScheduleWrite = Promise.withResolvers<void>()
    const writeSchedule = updateCheckSchedule.writeUpdateCheckSchedule
    vi.spyOn(updateCheckSchedule, "writeUpdateCheckSchedule").mockImplementationOnce(async (schedule) => {
      scheduleWriteStarted.resolve()
      await finishScheduleWrite.promise
      await writeSchedule(schedule)
    })
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(manifest))
      .mockResolvedValueOnce(Response.json(release))
      .mockResolvedValueOnce(new Response("abc"))
    vi.stubGlobal("fetch", fetch)
    const controller = new UpdaterController()

    const initialization = controller.initialize()
    await scheduleWriteStarted.promise
    const displayed = controller.getState()
    const download = controller.downloadUpdate({version: displayed.availableVersion!, hash: displayed.availableHash!})
    finishScheduleWrite.resolve()

    expect(displayed).toMatchObject({status: "available", availableVersion: manifest.version, availableHash: hash})
    await initialization
    expect(await download).toBe(true)
    expect(controller.getState()).toMatchObject({status: "installing", availableVersion: manifest.version})
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([manifestUrl, releaseUrl, assetUrl])
  })

  it("installs the offered DMG without checking again when a background check comes due during download", async () => {
    packaged = true
    vi.useFakeTimers()
    vi.spyOn(Math, "random").mockReturnValue(0.5)
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(manifest))
      .mockResolvedValueOnce(Response.json(release))
      .mockImplementationOnce(async () => {
        await vi.advanceTimersByTimeAsync(60 * 60_000)
        return new Response("abc")
      })
    vi.stubGlobal("fetch", fetch)
    const controller = new UpdaterController()

    await controller.initialize()
    expect(await controller.downloadUpdate({version: manifest.version, hash})).toBe(true)
    expect(controller.getState()).toMatchObject({status: "installing", availableVersion: manifest.version})
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([manifestUrl, releaseUrl, assetUrl])
    expect(spawn).toHaveBeenCalledOnce()
    expect(app.quit).toHaveBeenCalledOnce()
  })

  it.each([
    ["version", "1.2.0", hash, "abc"],
    ["hash", "1.1.0", "cb8379ac2098aa165029e3938a51da0bcecfc008fd6795f401178647f96c5b34", "def"],
  ])("requires a new click when the confirmed offer changes its %s before the renderer receives it", async (_, version, sha256, contents) => {
    const tag = `v${version}`
    const name = `Daily-${version}-mac.dmg`
    const url = `https://github.com/scheron/Daily/releases/download/${tag}/${name}`
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(manifest))
      .mockResolvedValueOnce(Response.json(release))
      .mockResolvedValueOnce(Response.json(makeManifest({version, tag, sha256})))
      .mockResolvedValueOnce(
        Response.json(makeRelease({tag_name: tag, assets: [makeAsset({id: 456, name, browser_download_url: url, digest: `sha256:${sha256}`})]})),
      )
      .mockResolvedValueOnce(new Response(contents))
    vi.stubGlobal("fetch", fetch)
    const send = vi.fn()
    const controller = new UpdaterController()
    controller.setMainWindow({isDestroyed: () => false, webContents: {send}} as unknown as BrowserWindow)
    const displayed = await controller.checkForUpdate()
    expect(displayed).toMatchObject({status: "available", availableVersion: manifest.version, availableHash: hash})
    const current = await controller.checkForUpdate({manual: false})
    expect(current).toMatchObject({status: "available", availableVersion: version, availableHash: sha256})
    send.mockClear()

    expect(await controller.downloadUpdate({version: manifest.version, hash})).toBe(false)
    expect(send).toHaveBeenCalledExactlyOnceWith("updates:state-changed", current)
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(spawn).not.toHaveBeenCalled()
    expect(app.quit).not.toHaveBeenCalled()

    expect(await controller.downloadUpdate({version, hash: sha256})).toBe(true)
    expect(fetch.mock.calls.at(-1)?.[0]).toBe(url)
    expect(app.quit).toHaveBeenCalledOnce()
  })

  it.each([() => new Response(null, {status: 404}), () => new Response("{")])(
    "retains a confirmed release when the manifest cannot be read after restart",
    async (unreadableManifest) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(Response.json(manifest))
        .mockResolvedValueOnce(Response.json(release))
        .mockResolvedValueOnce(unreadableManifest())
      vi.stubGlobal("fetch", fetch)

      await new UpdaterController().checkForUpdate()
      const restarted = new UpdaterController()
      await restarted.initialize()

      expect(restarted.getState()).toMatchObject({status: "available", availableVersion: manifest.version, availableHash: hash})
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([manifestUrl, releaseUrl, manifestUrl])
    },
  )

  it.each([
    ["abc", true],
    ["tampered bytes", false],
  ])("verifies the pinned cached DMG before starting installation after restart (%s)", async (contents, installs) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(manifest))
      .mockResolvedValueOnce(Response.json(release))
      .mockResolvedValueOnce(new Response(null, {status: 404}))
    vi.stubGlobal("fetch", fetch)
    const controller = new UpdaterController()
    await controller.checkForUpdate()

    const releaseDir = path.join(userData, "updates", "releases", `1.1.0_${hash}`)
    await mkdir(releaseDir, {recursive: true})
    await writeFile(path.join(releaseDir, assetName), contents)
    const restarted = new UpdaterController()
    await restarted.initialize()

    expect(restarted.getState()).toMatchObject({status: "downloaded", availableVersion: manifest.version, availableHash: hash})
    expect(await restarted.installDownloadedUpdate()).toBe(installs)
    expect(spawn).toHaveBeenCalledTimes(installs ? 1 : 0)
    expect(app.quit).toHaveBeenCalledTimes(installs ? 1 : 0)
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([manifestUrl, releaseUrl, manifestUrl])
  })

  it("retires the previous install failure when a retry rejects the corrupt cached download", async () => {
    const fetch = vi.fn().mockImplementation((url) => Response.json(url === manifestUrl ? manifest : release))
    vi.stubGlobal("fetch", fetch)
    await new UpdaterController().checkForUpdate()

    const updatesDir = path.join(userData, "updates")
    const releaseDir = path.join(updatesDir, "releases", `${manifest.version}_${hash}`)
    const cachePath = path.join(releaseDir, assetName)
    await mkdir(releaseDir, {recursive: true})
    await writeFile(cachePath, "tampered bytes")
    await writeFile(
      path.join(updatesDir, "install-failure.json"),
      JSON.stringify({
        releaseId: `${manifest.version}:${hash}`,
        version: manifest.version,
        source: "github",
        attemptedAt: "2026-11-04T00:00:00.000Z",
        code: "MOUNT_FAILED",
      }),
    )

    const retrying = new UpdaterController()
    await retrying.initialize()
    expect(retrying.getState()).toMatchObject({status: "downloaded", installFailure: {code: "MOUNT_FAILED"}})

    expect(await retrying.downloadUpdate({version: manifest.version, hash})).toBe(false)
    await expect(readFile(cachePath)).rejects.toMatchObject({code: "ENOENT"})
    expect(retrying.getState()).toMatchObject({
      status: "error",
      availableVersion: manifest.version,
      availableHash: hash,
      downloadedAt: null,
      installFailure: null,
    })
    expect(await retrying.checkForUpdate()).toMatchObject({status: "available", installFailure: null})

    const restarted = new UpdaterController()
    await restarted.initialize()
    expect(restarted.getState()).toMatchObject({status: "available", installFailure: null})
  })

  it("rechecks the manifest and exact tag before installing a legacy cache entry", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(manifest)).mockResolvedValueOnce(Response.json(release))
    vi.stubGlobal("fetch", fetch)
    const releaseDir = path.join(userData, "updates", "releases", "1.1.0_asset-123")
    await mkdir(releaseDir, {recursive: true})
    const cachePath = path.join(releaseDir, assetName)
    await writeFile(cachePath, "abc")
    const controller = new UpdaterController()
    controller.setStorageController(
      () =>
        ({
          loadSettings: async () => ({
            updates: {
              cached: {
                source: "github",
                releaseId: "1.1.0:asset-123",
                version: "1.1.0",
                hash,
                cachePath,
              },
            },
          }),
        }) as unknown as IStorageController,
    )

    expect(await controller.installDownloadedUpdate()).toBe(true)
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([manifestUrl, releaseUrl])
    expect(app.quit).toHaveBeenCalledOnce()
  })

  it("refuses a cached DMG symlink even when it points to bytes with the expected hash", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(manifest)).mockResolvedValueOnce(Response.json(release))
    vi.stubGlobal("fetch", fetch)
    const releaseDir = path.join(userData, "updates", "releases", `1.1.0_${hash}`)
    const outsideCache = path.join(userData, "outside-cache.dmg")
    await writeFile(outsideCache, "abc")
    await mkdir(releaseDir, {recursive: true})
    await symlink(outsideCache, path.join(releaseDir, assetName))

    const controller = new UpdaterController()
    expect(await controller.checkForUpdate()).toMatchObject({status: "available"})
    expect(await controller.installDownloadedUpdate()).toBe(false)
    expect(spawn).not.toHaveBeenCalled()
    expect(await readFile(outsideCache, "utf8")).toBe("abc")
  })

  it("removes stale cache files when a different release is confirmed", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(manifest)).mockResolvedValueOnce(Response.json(release))
    vi.stubGlobal("fetch", fetch)
    const releasesDir = path.join(userData, "updates", "releases")
    const staleDir = path.join(releasesDir, `1.0.1_${hash}`)
    const newDir = path.join(releasesDir, `1.1.0_${hash}`)
    await mkdir(staleDir, {recursive: true})
    await mkdir(newDir, {recursive: true})
    const staleDmg = path.join(staleDir, "Daily-1.0.1-mac.dmg")
    const newDmg = path.join(newDir, assetName)
    await writeFile(staleDmg, "abc")
    await writeFile(newDmg, "abc")

    expect(await new UpdaterController().checkForUpdate()).toMatchObject({status: "downloaded"})
    await expect(readFile(staleDmg)).rejects.toMatchObject({code: "ENOENT"})
    expect(await readFile(newDmg, "utf8")).toBe("abc")
  })
})
