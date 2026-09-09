import {describe, expect, it, vi} from "vitest"

import {setupStorageIPC} from "../../../src/main/setup/ipc/storage"

const handlers = new Map<string, (...args: any[]) => any>()

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler)
    },
  },
}))

const TOKEN = "0123456789012345678901234567890123456789012"

function bindingWithToken() {
  return {
    baseUrl: "http://127.0.0.1:8787",
    serverId: "srv-1",
    serverName: "Home Server",
    deviceId: "dev-1",
    deviceName: "MacBook Air",
    token: TOKEN,
    fingerprint: null,
    insecure: true,
    boundAt: "2026-08-10T00:00:00.000Z",
  }
}

describe("settings:load never carries the device credential", () => {
  it("returns the binding without its token and leaves the stored settings untouched", async () => {
    const binding = bindingWithToken()
    const stored = {version: "1", sync: {iCloud: {enabled: false}, server: {enabled: true, binding}}} as never

    setupStorageIPC(() => ({loadSettings: async () => stored}) as never)
    const returned = await handlers.get("settings:load")!({})

    expect(JSON.stringify(returned)).not.toContain(TOKEN)
    expect(JSON.stringify(returned)).not.toContain("token")
    expect(returned.sync.server.binding).toEqual({
      baseUrl: "http://127.0.0.1:8787",
      serverId: "srv-1",
      serverName: "Home Server",
      deviceId: "dev-1",
      deviceName: "MacBook Air",
      fingerprint: null,
      insecure: true,
      boundAt: "2026-08-10T00:00:00.000Z",
      role: null,
      approvedBy: null,
    })
    expect(returned.sync.server.enabled).toBe(true)
    expect(binding.token).toBe(TOKEN)
  })

  it("passes an unbound settings object through unchanged and survives uninitialized storage", async () => {
    const unbound = {version: "1", sync: {iCloud: {enabled: true}, server: {enabled: false, binding: null}}} as never

    setupStorageIPC(() => ({loadSettings: async () => unbound}) as never)
    expect(await handlers.get("settings:load")!({})).toEqual(unbound)

    setupStorageIPC(() => null)
    expect(await handlers.get("settings:load")!({})).toBeUndefined()
  })
})
