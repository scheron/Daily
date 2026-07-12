// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {StorageController} from "@main/storage/StorageController"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), storage: vi.fn(), lifecycle: vi.fn(), CONTEXT: {STORAGE: "STORAGE"}},
}))

// StorageController's field initializer calls electronPaths.appDataRoot(); mock electronPaths so no real `electron` app is touched under evitest.
vi.mock("@main/runtime/electronPaths", () => ({
  electronPaths: {
    appDataRoot: () => "/tmp/daily-test",
    assetsDir: () => "/tmp/daily-test/assets",
    dbPath: () => "/tmp/daily-test/db",
    remoteSyncPath: () => "/tmp/daily-test/remote",
    mutationSignalPath: () => "/tmp/daily-test/.s",
  },
}))

describe("handleExternalDataChange", () => {
  it("rebuilds the index and notifies data change", async () => {
    const controller = new StorageController()
    const rebuild = vi.fn()
    const notify = vi.fn()
    controller.searchService = {rebuildIndex: rebuild}
    controller.notifyStorageDataChange = notify
    await controller.handleExternalDataChange()
    expect(rebuild).toHaveBeenCalledOnce()
    expect(notify).toHaveBeenCalledOnce()
  })
})
