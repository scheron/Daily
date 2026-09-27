import {existsSync} from "node:fs"
import {readFile} from "node:fs/promises"
import {extname} from "node:path"

import {assetPath, findAsset, indexExistingAsset, isValidAssetName} from "../assets/AssetStore"

import type {File} from "@daily/protocol"
import type {ToolFilesPort} from "@daily/tools"
import type {ServerStore} from "../store/instance"
import type {AgentCommitEffect} from "./AgentWorkspace"

function fileAssetName(file: File): string {
  return `${file.id}.${extname(file.name).slice(1) || "bin"}`
}

function isAssetOnServer(store: ServerStore, file: File): boolean {
  const assetName = fileAssetName(file)
  return isValidAssetName(assetName) && findAsset(store, assetName) !== null && existsSync(assetPath(store, assetName))
}

/**
 * Builds the files port a tool call runs against: whether a file's bytes are on this server's
 * disk, reading them, and indexing a newly saved one once the call's snapshot write has committed
 * — the same deferral every other durable side effect of a write goes through. `afterSave` itself
 * resolves as soon as the effect is queued, not once it has run: the write only happens later, if
 * and when the enclosing snapshot write actually commits, so there is nothing to await yet.
 */
export function buildServerFilesPort(store: ServerStore, deviceId: string, afterCommit: (effect: AgentCommitEffect) => void): ToolFilesPort {
  return {
    isPresent: (file) => Promise.resolve(isAssetOnServer(store, file)),
    read: (file) => readFile(assetPath(store, fileAssetName(file))),
    afterSave: async (file, effect) => {
      afterCommit(async () => {
        await effect()
        indexExistingAsset(store, fileAssetName(file), deviceId)
      })
    },
  }
}
