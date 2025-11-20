import {protocol} from "electron"

import type {StorageController} from "../storage/StorageController.js"

export function setupSafeFileProtocol(storage: StorageController) {
  protocol.handle("daily", async (request) => {
    console.log(`🔗 Protocol handler called: ${request.url}`)

    const url = new URL(request.url)
    const host = url.hostname
    const pathname = url.pathname

    let id: string

    if (host === "file") {
      id = pathname.startsWith("/") ? pathname.slice(1) : pathname
    } else {
      id = `${host}${pathname}`
    }

    const response = await storage.createFileResponse(id)
    console.log(`📤 Protocol handler response:`, {
      status: response.status,
      contentType: response.headers.get("Content-Type"),
    })
    return response
  })
}
