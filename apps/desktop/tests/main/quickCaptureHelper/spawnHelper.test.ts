// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {spawnHelper} from "../../../src/main/quickCaptureHelper/spawnHelper"

const mocks = vi.hoisted(() => ({spawn: vi.fn(() => "child"), app: {isPackaged: false, getAppPath: () => "/app"}}))

vi.mock("node:child_process", () => ({spawn: mocks.spawn, default: {spawn: mocks.spawn}}))
vi.mock("electron", () => ({app: mocks.app}))

describe("spawning the helper", () => {
  const env = process.env

  beforeEach(() => {
    mocks.spawn.mockClear()
    process.env = {...env, ELECTRON_RUN_AS_NODE: "1", ELECTRON_RENDERER_URL: "http://localhost:5173", KEEP: "yes"}
  })

  afterEach(() => {
    process.env = env
  })

  it("starts this same binary with the app path and the helper flag when unpackaged", () => {
    mocks.app.isPackaged = false

    expect(spawnHelper()).toBe("child")

    expect(mocks.spawn).toHaveBeenCalledWith(
      process.execPath,
      ["/app", "--quick-capture-helper"],
      expect.objectContaining({stdio: ["pipe", "pipe", "pipe"]}),
    )
  })

  it("starts it with the helper flag alone when packaged", () => {
    mocks.app.isPackaged = true

    spawnHelper()

    expect(mocks.spawn.mock.calls[0][1]).toEqual(["--quick-capture-helper"])
  })

  it("keeps ELECTRON_RUN_AS_NODE out of its environment and hands on the rest, the renderer URL included", () => {
    spawnHelper()

    const childEnv = mocks.spawn.mock.calls[0][2].env
    expect(childEnv).not.toHaveProperty("ELECTRON_RUN_AS_NODE")
    expect(childEnv).toMatchObject({ELECTRON_RENDERER_URL: "http://localhost:5173", KEEP: "yes"})
    expect(process.env.ELECTRON_RUN_AS_NODE).toBe("1")
  })
})
