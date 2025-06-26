import {protocol} from "electron"
import type {StorageController} from "../storage/controller.js"

export function setupSafeFileProtocol(storage: StorageController) {
  protocol.handle("safe-file", async (request) => {
    const url = request.url.replace("safe-file://", "")
    return storage.getAssetResponse(url)
  })
} 