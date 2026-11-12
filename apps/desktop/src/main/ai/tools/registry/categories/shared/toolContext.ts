import {getTimezone} from "@daily/std"
import {createClock} from "@daily/tools"

import type {StorageController} from "@daily/core"
import type {ToolContext, ToolFilesPort} from "@daily/tools"

/** Uses the Assistant's stable actor identity and local storage; tool arguments cannot select another actor. */
export function buildToolContext(storage: StorageController): ToolContext {
  return {
    workStorage: storage.workStorage,
    workflowActorId: "daily-assistant",
    clock: createClock(getTimezone()),
    source: {kind: "agent"},
    files: buildLocalFilesPort(storage),
  }
}

function buildLocalFilesPort(storage: StorageController): ToolFilesPort {
  return {
    async isPresent(file) {
      return (await storage.workStorage.resolveAssetPath(file.id)) !== null
    },
    async read(file) {
      const response = await storage.createFileResponse(file.id)
      if (!response.ok) throw new Error(`File not found: ${file.id}`)
      return Buffer.from(await response.arrayBuffer())
    },
    afterSave(_file, effect) {
      return effect()
    },
  }
}
