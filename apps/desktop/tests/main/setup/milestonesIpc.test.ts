import {readFileSync} from "node:fs"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {describe, expect, it} from "vitest"

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "src")

const STORAGE_IPC_PATH = join(srcDir, "main", "setup", "ipc", "storage.ts")
const PRELOAD_PATH = join(srcDir, "main", "preload.ts")
const BRIDGE_TYPES_PATH = join(srcDir, "shared", "types", "ipc.ts")

const MILESTONE_CHANNELS = [
  "milestones:get-many",
  "milestones:get-one",
  "milestones:create",
  "milestones:update",
  "milestones:delete",
  "tasks:get-by-milestone",
  "tasks:set-milestone",
]

function channelsHandledIn(source: string): string[] {
  const channels: string[] = []
  const pattern = /ipcMain\.handle\(\s*["']([^"']+)["']/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source))) channels.push(match[1])
  return channels
}

function channelsKeyedIn(source: string): string[] {
  const channels: string[] = []
  const pattern = /^\s*"([^"]+)":/gm
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source))) channels.push(match[1])
  return channels
}

describe("milestones IPC channels agree across setup/ipc/storage.ts, preload.ts and shared/types/ipc.ts", () => {
  it("TC-11: all seven milestone channels are named, verbatim, in every one of the three files", () => {
    const storageChannels = new Set(channelsHandledIn(readFileSync(STORAGE_IPC_PATH, "utf-8")))
    const preloadChannels = new Set(channelsKeyedIn(readFileSync(PRELOAD_PATH, "utf-8")))
    const bridgeTypeChannels = new Set(channelsKeyedIn(readFileSync(BRIDGE_TYPES_PATH, "utf-8")))

    for (const channel of MILESTONE_CHANNELS) {
      const presence = [storageChannels.has(channel), preloadChannels.has(channel), bridgeTypeChannels.has(channel)]
      const presentCount = presence.filter(Boolean).length

      expect(presentCount, `${channel} is present in ${presentCount} of the three files, expected all 3`).toBe(3)
    }
  })
})
