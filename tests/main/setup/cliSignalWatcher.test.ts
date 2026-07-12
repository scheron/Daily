// @ts-nocheck
import fs from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {afterEach, describe, expect, it, vi} from "vitest"

import {setupCliSignalWatcher} from "@main/setup/app/cliSignalWatcher"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), storage: vi.fn(), lifecycle: vi.fn(), CONTEXT: {}},
}))

describe("setupCliSignalWatcher", () => {
  let stop
  afterEach(() => stop?.())

  it("calls handleExternalDataChange when the signal file changes", async () => {
    const signalPath = join(tmpdir(), `daily-signal-${Math.random().toString(36).slice(2)}`)
    const handle = vi.fn().mockResolvedValue(undefined)
    stop = setupCliSignalWatcher(() => ({handleExternalDataChange: handle}), signalPath)

    // fs.watch needs a tick to finish registering with the OS watch queue before
    // it reliably picks up a write; without this, a fully synchronous write can race it.
    await new Promise((r) => setTimeout(r, 20))
    fs.writeFileSync(signalPath, String(Date.now()))
    await new Promise((r) => setTimeout(r, 400))

    expect(handle).toHaveBeenCalled()
  })
})
