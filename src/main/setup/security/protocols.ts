import {protocol} from "electron"

import {logger} from "@/utils/logger"

import {APP_CONFIG} from "@/config"

import type {StorageController} from "@/storage/StorageController"

export function setupSafeFileProtocol(storage: StorageController) {
  protocol.handle(APP_CONFIG.protocol, async (request) => {
    logger.debug(logger.CONTEXT.FILES, `Protocol handler called: ${request.url}`)

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
    logger.debug(logger.CONTEXT.FILES, `Protocol response: ${response.status} ${response.headers.get("Content-Type")}`)
    return response
  })
}

export function setupPrivilegedSchemes() {
  APP_CONFIG.privilegedSchemes.forEach((scheme) => protocol.registerSchemesAsPrivileged([scheme]))
}
