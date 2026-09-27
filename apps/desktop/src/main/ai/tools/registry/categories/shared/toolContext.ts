import {getTimezone} from "@daily/std"
import {createClock} from "@daily/tools"

import type {StorageController} from "@daily/core"
import type {ToolContext, ToolFilesPort} from "@daily/tools"

function buildLocalFilesPort(storage: StorageController): ToolFilesPort {
  return {
    isPresent: async (file) => (await storage.workStorage.resolveAssetPath(file.id)) !== null,
    read: async (file) => {
      const response = await storage.createFileResponse(file.id)
      if (!response.ok) throw new Error(`File not found: ${file.id}`)
      return Buffer.from(await response.arrayBuffer())
    },
    afterSave: (_file, effect) => effect(),
  }
}

/** The host context every shared tool runs against here: the desktop's own `WorkStorage`, its local clock, `{kind: "agent"}` authorship, and local file presence. */
export function buildToolContext(storage: StorageController): ToolContext {
  return {
    workStorage: storage.workStorage,
    clock: createClock(getTimezone()),
    source: {kind: "agent"},
    files: buildLocalFilesPort(storage),
  }
}
