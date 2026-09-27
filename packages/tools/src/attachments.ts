import {extractFileIds} from "@daily/core/utils/files/extractFileIds"

import type {File, Task} from "@daily/protocol"
import type {ToolContext} from "./types"

type TaskFileRef = {file: File; onServer: boolean}

/**
 * `task`'s live files — the images its content links to, each once, in that order — with whether
 * their bytes are present here. An id with no live file row behind it is dropped.
 */
export async function taskFiles(ctx: ToolContext, task: Task): Promise<TaskFileRef[]> {
  const ids = extractFileIds(task.content)
  if (ids.length === 0) return []

  const files = await ctx.workStorage.getFiles(ids)
  const liveFilesById = new Map(files.filter((file) => file.deletedAt === null).map((file) => [file.id, file]))

  const refs: TaskFileRef[] = []
  for (const id of ids) {
    const file = liveFilesById.get(id)
    if (!file) continue

    refs.push({file, onServer: await ctx.files.isPresent(file)})
  }

  return refs
}
