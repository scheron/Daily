// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {FocusController} from "../../../src/main/focus/FocusController"
import {setupFocusIPC} from "../../../src/main/setup/ipc/focus"

const handlers = new Map<string, (...args: any[]) => any>()

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler)
    },
  },
  powerMonitor: {on: () => {}},
}))

describe("focus IPC", () => {
  it("runs a command over focus:dispatch, returns the next session, and serves that session over focus:get", async () => {
    const focus = new FocusController({getTask: async () => null, updateTask: async () => ({})}, () => {})
    setupFocusIPC(() => focus)

    const returned = await handlers.get("focus:dispatch")!({}, {type: "set-mode", mode: "timer"})

    expect(returned).toMatchObject({phase: "collect", mode: "timer", tasks: []})
    expect(await handlers.get("focus:get")!({})).toEqual(returned)
  })

  it("answers nothing before the controller exists", async () => {
    setupFocusIPC(() => null)

    expect(await handlers.get("focus:get")!({})).toBeUndefined()
    expect(await handlers.get("focus:dispatch")!({}, {type: "start"})).toBeUndefined()
  })
})
