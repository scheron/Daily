import {existsSync} from "node:fs"
import {extname} from "node:path"

import {extractFileIds} from "@daily/core/utils/files/extractFileIds"

import {assetPath, findAsset, isValidAssetName} from "../assets/AssetStore"

import type {File, Task} from "@daily/protocol"
import type {ServerStore} from "../store/instance"
import type {AgentToolContext} from "./AgentWorkspace"

export type TaskFileRef = {file: File; assetName: string; onServer: boolean}

/** The asset name a file's bytes are stored under on this server — the same name `DailyServerRemoteAdapter.syncAssets` uploads under. */
export function fileAssetName(file: File): string {
  return `${file.id}.${extname(file.name).slice(1) || "bin"}`
}

/** Whether `assetName`'s bytes are actually present on this server's disk, not merely indexed. */
export function isAssetOnServer(store: ServerStore, assetName: string): boolean {
  return isValidAssetName(assetName) && findAsset(store, assetName) !== null && existsSync(assetPath(store, assetName))
}

/**
 * `task`'s live files — the images its content links to, each once, in that order — with the name
 * they are stored under and whether their bytes are on this server. An id with no live file row
 * behind it is dropped.
 */
export async function taskFiles(ctx: AgentToolContext, task: Task): Promise<TaskFileRef[]> {
  const ids = extractFileIds(task.content)
  if (ids.length === 0) return []

  const files = await ctx.core.filesService.getFiles(ids)
  const liveFilesById = new Map(files.filter((file) => file.deletedAt === null).map((file) => [file.id, file]))

  const refs: TaskFileRef[] = []
  for (const id of ids) {
    const file = liveFilesById.get(id)
    if (!file) continue

    const assetName = fileAssetName(file)
    refs.push({file, assetName, onServer: isAssetOnServer(ctx.store, assetName)})
  }

  return refs
}
