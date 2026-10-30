import {afterAll, beforeAll, describe, expect, it, vi} from "vitest"

import {UpdaterController} from "../../../../src/main/modules/updates/UpdaterController"

import type * as DemoProfile from "../../../../src/main/demo/profile"

const {resolveLatestRelease, downloadRelease, applyPendingInstallResult} = vi.hoisted(() => ({
  resolveLatestRelease: vi.fn(),
  downloadRelease: vi.fn(),
  applyPendingInstallResult: vi.fn(),
}))

vi.mock("electron", () => ({app: {getVersion: () => "1.0.0", getPath: () => "/tmp", quit: vi.fn()}}))
vi.mock("@main/demo/profile", async (importOriginal) => ({
  ...(await importOriginal<typeof DemoProfile>()),
  IS_DEMO: true,
}))
vi.mock("../../../../src/main/modules/updates/release", () => ({resolveLatestRelease, downloadRelease}))
vi.mock("../../../../src/main/modules/updates/utils/applyPendingInstallResult", () => ({applyPendingInstallResult}))

describe("demo updater isolation", () => {
  const originalPlatform = process.platform

  beforeAll(() => Object.defineProperty(process, "platform", {value: "darwin"}))
  afterAll(() => Object.defineProperty(process, "platform", {value: originalPlatform}))

  it("cannot fetch, download, or install the regular app through startup or manual actions", async () => {
    const controller = new UpdaterController()

    await controller.initialize()
    expect(await controller.checkForUpdate({manual: true})).toMatchObject({status: "unavailable", reason: "Updates are disabled in Daily Demo."})
    expect(await controller.downloadUpdate()).toBe(false)
    expect(await controller.installDownloadedUpdate()).toBe(false)
    expect(resolveLatestRelease).not.toHaveBeenCalled()
    expect(downloadRelease).not.toHaveBeenCalled()
    expect(applyPendingInstallResult).not.toHaveBeenCalled()
  })
})
